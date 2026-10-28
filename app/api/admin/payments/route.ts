import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest, getAdminIdentity, adminSessionCookieName } from "@/lib/admin-auth";
import { grantPaidEntitlement } from "@/lib/entitlements";
import { pool } from "@/lib/db";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  paymentNo: z.string().min(4).max(40),
  status: z.enum(["paid", "failed", "cancelled"]),
});

type PaymentRow = {
  id: number;
  paymentNo: string;
  userId: number;
  bookingId: number | null;
  amount: number;
  status: string;
  metadataText: string | null;
};

export async function PUT(req: NextRequest) {
  const adminError = await assertAdminRequest(req);
  if (adminError) return adminError;
  const admin = await getAdminIdentity(req.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return secureResponse(NextResponse.json({ message: "Admin access denied" }, { status: 401 }));

  let input: z.infer<typeof schema>;
  try {
    input = await parseJsonBody(req, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT id, payment_no paymentNo, user_id userId, booking_id bookingId, amount, status, CAST(metadata AS CHAR) metadataText FROM payments WHERE payment_no = ? FOR UPDATE",
      [input.paymentNo],
    );
    const payment = (rows as PaymentRow[])[0];
    if (!payment) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "ไม่พบรายการชำระเงิน" }, { status: 404 }));
    }
    if (payment.status !== "created") {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "รายการนี้ถูกจัดการแล้ว" }, { status: 409 }));
    }
    if (input.status === "paid" && payment.bookingId) {
      const [bookings] = await conn.execute("SELECT status, expires_at > NOW() valid FROM bookings WHERE id = ? FOR UPDATE", [payment.bookingId]);
      const booking = (bookings as { status: string; valid: number }[])[0];
      if (!booking || !booking.valid || !["hold", "pending_payment"].includes(booking.status)) {
        await conn.rollback();
        return secureResponse(NextResponse.json({ message: "Booking is no longer payable" }, { status: 409 }));
      }
    }

    await conn.execute("UPDATE payments SET status = ?, paid_at = IF(? = 'paid', NOW(), paid_at) WHERE id = ?", [input.status, input.status, payment.id]);
    if (input.status === "paid") {
      if (payment.bookingId) {
        await conn.execute("UPDATE bookings SET status = 'paid' WHERE id = ? AND status IN ('hold','pending_payment')", [payment.bookingId]);
      } else {
        await grantFromPayment(conn, payment);
      }
    }
    await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'payment.status', 'payment', ?, JSON_OBJECT('status', ?))", [
      admin.id,
      payment.paymentNo,
      input.status,
    ]);
    const payments = await listPayments(conn);
    await conn.commit();
    return secureResponse(NextResponse.json({ payments }));
  } catch (error) {
    await conn?.rollback().catch(() => {});
    return secureResponse(NextResponse.json({ message: error instanceof PaymentGrantError ? error.message : "ไม่ทราบผลการยืนยัน กรุณาตรวจสถานะรายการก่อนลองใหม่" }, { status: error instanceof PaymentGrantError ? 409 : 503 }));
  } finally {
    conn?.release();
  }
}

async function grantFromPayment(conn: Awaited<ReturnType<typeof pool.getConnection>>, payment: PaymentRow) {
  const metadata = parseMetadata(payment.metadataText);
  if (metadata.kind === "wallet_topup") {
    await conn.execute("INSERT IGNORE INTO wallet_accounts (user_id) VALUES (?)", [payment.userId]);
    await conn.execute("UPDATE wallet_accounts SET balance = balance + ?, point_balance = point_balance + ? WHERE user_id = ?", [
      payment.amount,
      Math.floor(Number(payment.amount)),
      payment.userId,
    ]);
    await conn.execute(
      "INSERT INTO wallet_ledger (user_id, kind, amount, point_delta, ref_type, ref_id, note) VALUES (?, 'topup', ?, ?, 'payment', ?, 'เติมเงิน Wallet จากการยืนยันชำระ')",
      [payment.userId, payment.amount, Math.floor(Number(payment.amount)), payment.id],
    );
    return;
  }
  const itemType = String(metadata.itemType || "");
  const itemName = String(metadata.itemName || "PPA package");
  if (itemType === "coupon") {
    if (!Number.isSafeInteger(Number(metadata.couponId)) || Number(metadata.couponId) <= 0) throw new PaymentGrantError("ข้อมูลคูปองไม่ถูกต้อง");
    const [couponRows] = await conn.execute(
      "SELECT id, total_uses totalUses, validity_days validityDays FROM coupons WHERE id = ? AND active = TRUE LIMIT 1 FOR UPDATE",
      [Number(metadata.couponId)],
    );
    const coupon = (couponRows as { id: number; totalUses: number; validityDays: number }[])[0];
    if (coupon) {
      await conn.execute(
        "INSERT INTO user_coupons (user_id, coupon_id, remaining_uses, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
        [payment.userId, coupon.id, coupon.totalUses, coupon.validityDays],
      );
      return;
    }
    throw new PaymentGrantError("คูปองนี้ไม่พร้อมใช้งาน กรุณาตรวจรายการก่อนยืนยันชำระ");
  }
  if (!["membership", "trainer", "class"].includes(itemType) || typeof metadata.itemName !== "string" || !metadata.itemName.trim()) throw new PaymentGrantError("ข้อมูลสิทธิ์การชำระเงินไม่ครบถ้วน");
  await grantPaidEntitlement(conn, {
    amount: Number(payment.amount),
    itemName,
    itemType,
    paymentId: payment.id,
    userId: payment.userId,
  });
}

class PaymentGrantError extends Error {}

async function listPayments(conn: Awaited<ReturnType<typeof pool.getConnection>>) {
  const [rows] = await conn.execute(
    "SELECT p.payment_no paymentNo, u.display_name displayName, p.method, p.amount, p.status, p.paid_at paidAt FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 80",
  );
  return rows;
}

function parseMetadata(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}
