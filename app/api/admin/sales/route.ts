import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionCookieName, assertAdminRequest, getAdminIdentity } from "@/lib/admin-auth";
import { createPublicId, pool, query } from "@/lib/db";
import { grantCoupon, grantPaidEntitlement } from "@/lib/entitlements";
import { notifyMember, pushAfterResponse, pushText } from "@/lib/notify";
import { resolvePaymentItem } from "@/lib/payment-catalog";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";
import { findPaymentByRequest, isDuplicateEntry, requestIdPattern } from "@/lib/wallet";

const schema = z.object({
  userId: z.number().int().positive(),
  kind: z.enum(["content", "coupon"]),
  itemId: z.number().int().positive(),
  method: z.enum(["cash", "card", "promptpay"]),
  requestId: z.string().regex(requestIdPattern),
  // The price shown to the staff member; the sale is refused if the catalog price changed since.
  expectedAmount: z.number().nonnegative().max(9_999_999),
  note: z.string().trim().max(200).optional(),
});

type Sale = { amount: number; itemName: string; itemType: string; metadata: Record<string, unknown>; grant: (conn: Awaited<ReturnType<typeof pool.getConnection>>, paymentId: number) => Promise<void> };

const json = (body: unknown, status = 200) => secureResponse(NextResponse.json(body, { status }));

// Catalog for the counter: packages/time passes/service packages and coupons, at server prices.
export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const [content, coupons] = await Promise.all([
    query("SELECT id, content_type contentType, title, price FROM app_content_items WHERE active = TRUE AND price > 0 AND content_type IN ('membership_plan','time_pass','service_package') ORDER BY content_type, sort_order, id"),
    query("SELECT id, name, price, total_uses totalUses, validity_days validityDays FROM coupons WHERE active = TRUE AND price > 0 ORDER BY sort_order, id"),
  ]);
  return json({ content, coupons });
}

// Front-desk sale (cash / card / bank transfer) for a member: paid payment attributed to the
// staff member, rights granted with the same rules as an app purchase, member notified.
export async function POST(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const admin = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return json({ message: "Admin access denied" }, 401);
  let input: z.infer<typeof schema>;
  try {
    input = await parseJsonBody(request, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  // Read the package catalog before the transaction: it uses its own pooled connection and must not
  // run while this transaction holds the member row lock.
  const catalogItem = input.kind === "content" ? await resolvePaymentItem({ contentId: input.itemId }) : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const replay = await findPaymentByRequest(conn, input.userId, input.requestId);
    if (replay) {
      await conn.rollback();
      return json({ ...replay, replayed: true });
    }
    const [userRows] = await conn.execute("SELECT id, status FROM users WHERE id = ? FOR UPDATE", [input.userId]);
    const user = (userRows as { id: number; status: string }[])[0];
    if (!user) {
      await conn.rollback();
      return json({ message: "ไม่พบสมาชิก" }, 404);
    }
    if (user.status !== "active") {
      await conn.rollback();
      return json({ message: "สมาชิกนี้ไม่ได้อยู่ในสถานะใช้งาน" }, 409);
    }

    let sale: Sale | null = null;
    if (input.kind === "content") {
      const item = catalogItem;
      if (item) {
        sale = {
          amount: item.amount,
          itemName: item.itemName,
          itemType: item.itemType,
          metadata: { contentId: item.contentId, grant: item.grant },
          grant: (connection, paymentId) => grantPaidEntitlement(connection, { amount: item.amount, itemName: item.itemName, itemType: item.itemType, paymentId, userId: input.userId, grant: item.grant }),
        };
      }
    } else {
      const [couponRows] = await conn.execute("SELECT id, name, price, total_uses totalUses, validity_days validityDays FROM coupons WHERE id = ? AND active = TRUE AND price > 0 FOR UPDATE", [input.itemId]);
      const coupon = (couponRows as { id: number; name: string; price: number; totalUses: number; validityDays: number }[])[0];
      if (coupon) {
        sale = {
          amount: Number(coupon.price),
          itemName: coupon.name,
          itemType: "coupon",
          metadata: { couponId: coupon.id, totalUses: Number(coupon.totalUses), validityDays: Number(coupon.validityDays) },
          grant: (connection, paymentId) => grantCoupon(connection, { userId: input.userId, couponId: coupon.id, totalUses: Number(coupon.totalUses), validityDays: Number(coupon.validityDays), paymentId }),
        };
      }
    }
    if (!sale) {
      await conn.rollback();
      return json({ message: "ไม่พบรายการที่เปิดขาย" }, 404);
    }
    if (Math.abs(sale.amount - input.expectedAmount) > 0.004) {
      await conn.rollback();
      return json({ code: "PRICE_CHANGED", amount: sale.amount, message: "ราคาของรายการนี้เปลี่ยนแล้ว กรุณาตรวจสอบราคาใหม่ก่อนยืนยัน" }, 409);
    }

    const paymentNo = createPublicId("PAY");
    const metadata = { itemName: sale.itemName, itemType: sale.itemType, ...sale.metadata, channel: "counter", soldBy: admin.id, ...(input.note ? { note: input.note } : {}) };
    const [payment] = await conn.execute(
      "INSERT INTO payments (payment_no, user_id, method, amount, status, provider_ref, request_id, metadata, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
      [paymentNo, input.userId, input.method, sale.amount, "paid", createPublicId("REF"), input.requestId, JSON.stringify(metadata)],
    );
    await sale.grant(conn, Number((payment as { insertId?: number }).insertId || 0));
    const body = `${sale.itemName} · ${sale.amount.toLocaleString("th-TH")} ฿ · ${paymentNo}`;
    await notifyMember(conn, input.userId, "ได้รับสิทธิ์จากเคาน์เตอร์", body);
    await conn.execute(
      "INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'sale.create', 'payment', ?, ?)",
      [admin.id, paymentNo, JSON.stringify({ userId: input.userId, kind: input.kind, itemId: input.itemId, method: input.method, amount: sale.amount })],
    );
    await conn.commit();
    pushAfterResponse(input.userId, pushText("ได้รับสิทธิ์จากเคาน์เตอร์", body));
    return json({ paymentNo, status: "paid" }, 201);
  } catch (error) {
    await conn.rollback();
    const winner = isDuplicateEntry(error) ? await findPaymentByRequest(conn, input.userId, input.requestId) : null;
    if (winner) return json({ ...winner, replayed: true });
    throw error;
  } finally {
    conn.release();
  }
}
