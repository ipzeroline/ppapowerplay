import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { grantPaidEntitlement } from "@/lib/entitlements";
import { pool, query } from "@/lib/db";
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
  const adminError = assertAdminRequest(req);
  if (adminError) return adminError;

  let input: z.infer<typeof schema>;
  try {
    input = await parseJsonBody(req, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  const conn = await pool.getConnection();
  try {
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

    await conn.execute("UPDATE payments SET status = ?, paid_at = IF(? = 'paid', NOW(), paid_at) WHERE id = ?", [input.status, input.status, payment.id]);
    if (input.status === "paid") {
      if (payment.bookingId) {
        await conn.execute("UPDATE bookings SET status = 'paid' WHERE id = ? AND status IN ('hold','pending_payment')", [payment.bookingId]);
      } else {
        await grantFromPayment(conn, payment);
      }
    }
    await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (NULL, 'payment.status', 'payment', ?, JSON_OBJECT('status', ?))", [
      payment.paymentNo,
      input.status,
    ]);
    await conn.commit();
    return secureResponse(NextResponse.json({ payments: await listPayments() }));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
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
  if (itemType === "coupon" && metadata.couponId) {
    const [couponRows] = await conn.execute(
      "SELECT id, total_uses totalUses, validity_days validityDays FROM coupons WHERE id = ? AND active = TRUE LIMIT 1",
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
  }
  await grantPaidEntitlement(conn, {
    amount: Number(payment.amount),
    itemName,
    itemType,
    paymentId: payment.id,
    userId: payment.userId,
  });
}

async function listPayments() {
  return query(
    "SELECT p.payment_no paymentNo, u.display_name displayName, p.method, p.amount, p.status, p.paid_at paidAt FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 80",
  );
}

function parseMetadata(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}
