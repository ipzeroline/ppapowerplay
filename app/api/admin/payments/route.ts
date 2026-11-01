import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest, getAdminIdentity, adminSessionCookieName } from "@/lib/admin-auth";
import { grantCoupon, grantPaidEntitlement } from "@/lib/entitlements";
import { normalizeGrant } from "@/lib/package-grant";
import { applyCouponRenewal, applyMembershipPause, RenewalError } from "@/lib/renewals";
import { notifyMember, pushAfterResponse, pushText } from "@/lib/notify";
import { pool } from "@/lib/db";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";
import { adminPaymentListSql } from "@/lib/admin-payment-list";

const schema = z.object({
  paymentNo: z.string().min(4).max(40),
  // Staff reject a payment by cancelling it with a reason ("failed" had no refund path).
  status: z.enum(["paid", "cancelled", "refunded"]),
  // Why staff cancelled (shown to the member) or the refund note when recording a refund.
  reason: z.string().trim().max(200).optional(),
});

type PaymentRow = {
  id: number;
  paymentNo: string;
  userId: number;
  bookingId: number | null;
  amount: number;
  status: string;
  slipPath: string | null;
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
      "SELECT id, payment_no paymentNo, user_id userId, booking_id bookingId, amount, status, slip_path slipPath, CAST(metadata AS CHAR) metadataText FROM payments WHERE payment_no = ? FOR UPDATE",
      [input.paymentNo],
    );
    const payment = (rows as PaymentRow[])[0];
    if (!payment) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "ไม่พบรายการชำระเงิน" }, { status: 404 }));
    }
    if (input.status === "refunded") {
      // Staff record that the money of a cancelled, slip-backed payment was transferred back.
      const metadata = parseMetadata(payment.metadataText);
      const refund = metadata.refund && typeof metadata.refund === "object" ? metadata.refund as Record<string, unknown> : null;
      if (payment.status !== "cancelled" || refund?.status !== "pending") {
        await conn.rollback();
        return secureResponse(NextResponse.json({ message: "รายการนี้ไม่ได้รอคืนเงิน" }, { status: 409 }));
      }
      metadata.refund = { ...refund, status: "done", by: admin.id, at: new Date().toISOString(), ...(input.reason ? { note: input.reason } : {}) };
      await conn.execute("UPDATE payments SET status = 'refunded', metadata = ? WHERE id = ?", [JSON.stringify(metadata), payment.id]);
      const notice = paymentNotice(payment, "refunded");
      await notifyMember(conn, payment.userId, notice.title, notice.body);
      await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'payment.refund', 'payment', ?, ?)", [
        admin.id,
        payment.paymentNo,
        JSON.stringify({ note: input.reason || null }),
      ]);
      const payments = await listPayments(conn);
      await conn.commit();
      pushAfterResponse(payment.userId, pushText(notice.title, notice.body));
      return secureResponse(NextResponse.json({ payments }));
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

    if (input.status === "paid") {
      await conn.execute("UPDATE payments SET status = ?, paid_at = IF(? = 'paid', NOW(), paid_at) WHERE id = ?", [input.status, input.status, payment.id]);
    } else {
      // The reason reaches the member; money already transferred (a slip exists) awaits a recorded refund.
      const metadata = parseMetadata(payment.metadataText);
      metadata.cancelReason = input.reason || null;
      metadata.decidedBy = admin.id;
      if (payment.slipPath) metadata.refund = { status: "pending" };
      await conn.execute("UPDATE payments SET status = ?, metadata = ? WHERE id = ?", [input.status, JSON.stringify(metadata), payment.id]);
    }
    if (input.status === "paid") {
      if (payment.bookingId) {
        await conn.execute("UPDATE bookings SET status = 'paid' WHERE id = ? AND status IN ('hold','pending_payment')", [payment.bookingId]);
      } else {
        await grantFromPayment(conn, payment);
      }
    } else if (payment.bookingId) {
      // A slip keeps the court held until staff decide; a rejected payment frees the court now.
      await conn.execute("UPDATE bookings SET expires_at = NOW() WHERE id = ? AND status IN ('hold','pending_payment')", [payment.bookingId]);
    }
    const notice = paymentNotice(payment, input.status, input.reason);
    await notifyMember(conn, payment.userId, notice.title, notice.body);
    await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'payment.status', 'payment', ?, JSON_OBJECT('status', ?, 'reason', ?))", [
      admin.id,
      payment.paymentNo,
      input.status,
      input.reason || null,
    ]);
    const payments = await listPayments(conn);
    await conn.commit();
    pushAfterResponse(payment.userId, pushText(notice.title, notice.body));
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
      // Terms shown at purchase time win over later edits of the coupon definition.
      const totalUses = integerIn(metadata.totalUses, 1, 999) ?? Number(coupon.totalUses);
      const validityDays = integerIn(metadata.validityDays, 1, 3650) ?? Number(coupon.validityDays);
      await grantCoupon(conn, { userId: payment.userId, couponId: coupon.id, totalUses, validityDays, paymentId: payment.id });
      return;
    }
    throw new PaymentGrantError("คูปองนี้ไม่พร้อมใช้งาน กรุณาตรวจรายการก่อนยืนยันชำระ");
  }
  if (itemType === "membership_pause" || itemType === "coupon_renewal") {
    await applyRenewalPayment(conn, payment, itemType, metadata);
    return;
  }
  if (!["membership", "time_pass", "trainer", "class"].includes(itemType) || typeof metadata.itemName !== "string" || !metadata.itemName.trim()) throw new PaymentGrantError("ข้อมูลสิทธิ์การชำระเงินไม่ครบถ้วน");
  await grantPaidEntitlement(conn, {
    amount: Number(payment.amount),
    itemName,
    itemType,
    paymentId: payment.id,
    userId: payment.userId,
    grant: normalizeGrant(metadata.grant),
  });
}

// Paid pause / coupon-renewal requests are re-validated under row locks at approval time.
async function applyRenewalPayment(conn: Awaited<ReturnType<typeof pool.getConnection>>, payment: PaymentRow, itemType: "membership_pause" | "coupon_renewal", metadata: Record<string, unknown>) {
  try {
    if (itemType === "membership_pause") {
      const membershipId = integerIn(metadata.membershipId, 1, Number.MAX_SAFE_INTEGER);
      const days = integerIn(metadata.days, 1, 60);
      const startDate = typeof metadata.startDate === "string" ? metadata.startDate : "";
      if (!membershipId || !days || !startDate) throw new PaymentGrantError("ข้อมูลคำขอพักการใช้งานไม่ครบถ้วน");
      await applyMembershipPause(conn, { userId: payment.userId, membershipId, startDate, days, paymentId: payment.id, enforceLeadTime: false });
      return;
    }
    const userCouponId = integerIn(metadata.userCouponId, 1, Number.MAX_SAFE_INTEGER);
    const months = integerIn(metadata.months, 1, 12);
    if (!userCouponId || !months) throw new PaymentGrantError("ข้อมูลคำขอต่ออายุคูปองไม่ครบถ้วน");
    await applyCouponRenewal(conn, { userId: payment.userId, userCouponId, months });
  } catch (error) {
    if (error instanceof RenewalError) throw new PaymentGrantError(error.message);
    throw error;
  }
}

function integerIn(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

class PaymentGrantError extends Error {}

function paymentNotice(payment: PaymentRow, status: "paid" | "cancelled" | "refunded", reason?: string) {
  const metadata = parseMetadata(payment.metadataText);
  const itemName = typeof metadata.itemName === "string" && metadata.itemName.trim() ? metadata.itemName : payment.paymentNo;
  const body = `${itemName} · ${Number(payment.amount).toLocaleString("th-TH")} ฿ · ${payment.paymentNo}`;
  if (status === "paid") return { title: "ชำระเงินสำเร็จ", body };
  if (status === "refunded") return { title: "คืนเงินแล้ว", body };
  const why = reason ? ` · เหตุผล: ${reason}` : "";
  const refund = payment.slipPath ? " · หากโอนเงินแล้ว เจ้าหน้าที่จะคืนเงินให้" : "";
  return { title: "ยกเลิกรายการชำระเงิน", body: `${body}${why}${refund}` };
}

async function listPayments(conn: Awaited<ReturnType<typeof pool.getConnection>>) {
  const [rows] = await conn.execute(adminPaymentListSql);
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
