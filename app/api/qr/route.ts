import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createQrToken, hashQrToken } from "@/lib/qr";
import { pool, query } from "@/lib/db";
import { checkRateLimit, clientIp, secureResponse } from "@/lib/security";

const purposeSchema = z.enum(["member", "booking", "coupon", "entitlement", "payment"]);

type RefCheck = {
  refId: string | null;
  title: string;
};

export async function GET(req: NextRequest) {
  const limited = checkRateLimit({ key: `qr:${await clientIp()}`, limit: 40, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }

  const purpose = purposeSchema.safeParse(req.nextUrl.searchParams.get("purpose") || "member");
  if (!purpose.success) return secureResponse(NextResponse.json({ message: "ประเภท QR ไม่ถูกต้อง" }, { status: 400 }));

  const ref = await resolveRef(req, user.id, purpose.data);
  if (!ref) return secureResponse(NextResponse.json({ message: "ไม่พบสิทธิ์สำหรับออก QR" }, { status: 404 }));

  const token = createQrToken();
  const tokenHash = hashQrToken(token);
  const ttl = ttlSeconds(purpose.data);
  const verifyUrl = `${req.nextUrl.origin}/api/qr/verify?token=${encodeURIComponent(token)}`;

  const conn = await pool.getConnection();
  try {
    await conn.execute("DELETE FROM qr_tokens WHERE user_id = ? AND expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)", [user.id]);
    await conn.execute(
      "INSERT INTO qr_tokens (user_id, purpose, ref_id, token_hash, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))",
      [user.id, purpose.data, ref.refId, tokenHash, ttl],
    );
  } finally {
    conn.release();
  }

  const svg = await QRCode.toString(verifyUrl, {
    type: "svg",
    margin: 1,
    width: 220,
    errorCorrectionLevel: "M",
  });
  return secureResponse(NextResponse.json({ svg, expiresIn: ttl, title: ref.title, verifyUrl }));
}

async function resolveRef(req: NextRequest, userId: number, purpose: z.infer<typeof purposeSchema>): Promise<RefCheck | null> {
  if (purpose === "member") {
    const membership = (
      await query<{ id: number; planName: string }>(
        "SELECT id, plan_name planName FROM memberships WHERE user_id = ? AND status = 'active' AND ends_at >= NOW() ORDER BY ends_at DESC LIMIT 1",
        [userId],
      )
    )[0];
    return membership ? { refId: String(membership.id), title: membership.planName } : null;
  }

  if (purpose === "booking") {
    const bookingNo = req.nextUrl.searchParams.get("bookingNo") || "";
    const booking = (
      await query<{ bookingNo: string; title: string }>(
        "SELECT booking_no bookingNo, title FROM bookings WHERE booking_no = ? AND user_id = ? AND status IN ('paid','checked_in') LIMIT 1",
        [bookingNo, userId],
      )
    )[0];
    return booking ? { refId: booking.bookingNo, title: booking.title } : null;
  }

  if (purpose === "coupon") {
    const couponId = Number(req.nextUrl.searchParams.get("couponId") || 0);
    const coupon = (
      await query<{ id: number; name: string }>(
        "SELECT uc.id, c.name FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.id = ? AND uc.user_id = ? AND uc.status = 'active' AND uc.remaining_uses > 0 AND uc.expires_at >= NOW() LIMIT 1",
        [couponId, userId],
      )
    )[0];
    return coupon ? { refId: String(coupon.id), title: coupon.name } : null;
  }

  if (purpose === "entitlement") {
    const entitlementId = Number(req.nextUrl.searchParams.get("entitlementId") || 0);
    const entitlement = (
      await query<{ id: number; title: string }>(
        "SELECT id, title FROM user_entitlements WHERE id = ? AND user_id = ? AND status = 'active' AND (ends_at IS NULL OR ends_at >= NOW()) AND (remaining_uses IS NULL OR remaining_uses > 0) LIMIT 1",
        [entitlementId, userId],
      )
    )[0];
    return entitlement ? { refId: String(entitlement.id), title: entitlement.title } : null;
  }

  const paymentNo = req.nextUrl.searchParams.get("paymentNo") || "";
  const payment = (
    await query<{ paymentNo: string; amount: number }>(
      "SELECT payment_no paymentNo, amount FROM payments WHERE payment_no = ? AND user_id = ? LIMIT 1",
      [paymentNo, userId],
    )
  )[0];
  return payment ? { refId: payment.paymentNo, title: `Payment ${payment.paymentNo}` } : null;
}

function ttlSeconds(purpose: z.infer<typeof purposeSchema>) {
  if (purpose === "member") return 30;
  if (purpose === "booking") return 60;
  return 120;
}
