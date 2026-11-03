import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createQrToken, hashQrToken } from "@/lib/qr";
import { pool, query } from "@/lib/db";
import { MEMBERSHIP_NOT_PAUSED } from "@/lib/renewals";
import { checkRateLimit, clientIp, secureResponse } from "@/lib/security";

const purposeSchema = z.enum(["member", "booking", "coupon", "entitlement", "payment"]);

type RefCheck = {
  refId: string | null;
  title: string;
};

export async function GET(req: NextRequest) {
  // Members at the club share one Wi-Fi address: a loose limit per address, the real one per member
  // (the screen asks for a new QR every 20 s, 3 a minute).
  const crowded = checkRateLimit({ key: `qr:${await clientIp()}`, limit: 600, windowMs: 60_000 });
  if (crowded) return crowded;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const limited = checkRateLimit({ key: `qr:member:${user.id}`, limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const purpose = purposeSchema.safeParse(req.nextUrl.searchParams.get("purpose") || "member");
  if (!purpose.success) return secureResponse(NextResponse.json({ message: "ประเภท QR ไม่ถูกต้อง" }, { status: 400 }));

  try {
    return await issueQr(req, user.id, purpose.data);
  } catch {
    return secureResponse(NextResponse.json({ code: "QR_SERVICE_UNAVAILABLE", message: "บริการ QR ไม่พร้อมใช้งาน กรุณาลองใหม่" }, { status: 503 }));
  }
}

async function issueQr(req: NextRequest, userId: number, purpose: z.infer<typeof purposeSchema>) {
  const ref = await resolveRef(req, userId, purpose);
  if (!ref && purpose === "member") {
    // Say why: an active package that is currently paused (lib/renewals.ts).
    const [paused] = await query<{ pausedUntil: string }>(
      "SELECT MAX(mp.ends_at) pausedUntil FROM memberships m JOIN membership_pauses mp ON mp.membership_id = m.id AND mp.status = 'active' AND mp.starts_at <= NOW() AND mp.ends_at > NOW() WHERE m.user_id = ? AND m.status = 'active' AND m.ends_at > NOW() HAVING MAX(mp.ends_at) IS NOT NULL",
      [userId],
    );
    if (paused) return secureResponse(NextResponse.json({ code: "MEMBERSHIP_PAUSED", message: "แพ็กเกจอยู่ระหว่างพักการใช้งาน", pausedUntil: paused.pausedUntil }, { status: 404 }));
  }
  if (!ref) return secureResponse(NextResponse.json({
    code: purpose === "member" ? "NO_ACTIVE_MEMBERSHIP" : "NO_QR_RIGHTS",
    message: purpose === "member" ? "ไม่พบแพ็กเกจสมาชิกที่ใช้งานได้" : "ไม่พบสิทธิ์สำหรับออก QR",
  }, { status: 404 }));

  const token = createQrToken();
  const tokenHash = hashQrToken(token);
  const ttl = ttlSeconds(purpose);
  // A short address (fewer QR squares, read from further away) that opens the staff scanner with the
  // code filled in, so staff can also scan with any phone camera. The public address (APP_BASE_URL)
  // is used: behind the proxy the request sees an inside one.
  const base = (process.env.APP_BASE_URL || req.nextUrl.origin).replace(/\/+$/, "");
  const verifyUrl = `${base}/q/${token}`;

  const conn = await pool.getConnection();
  try {
    await conn.execute("DELETE FROM qr_tokens WHERE user_id = ? AND expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)", [userId]);
    await conn.execute(
      "INSERT INTO qr_tokens (user_id, purpose, ref_id, token_hash, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))",
      [userId, purpose, ref.refId, tokenHash, ttl],
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
        `SELECT id, plan_name planName FROM memberships WHERE user_id = ? AND status = 'active' AND starts_at <= NOW() AND ends_at > NOW() AND ${MEMBERSHIP_NOT_PAUSED} ORDER BY ends_at DESC LIMIT 1`,
        [userId],
      )
    )[0];
    return membership ? { refId: String(membership.id), title: membership.planName } : null;
  }

  if (purpose === "booking") {
    const bookingNo = req.nextUrl.searchParams.get("bookingNo") || "";
    const booking = (
      await query<{ bookingNo: string; title: string }>(
        "SELECT booking_no bookingNo, title FROM bookings WHERE booking_no = ? AND user_id = ? AND status = 'paid' AND ends_at > NOW() LIMIT 1",
        [bookingNo, userId],
      )
    )[0];
    return booking ? { refId: booking.bookingNo, title: booking.title } : null;
  }

  if (purpose === "coupon") {
    const couponId = Number(req.nextUrl.searchParams.get("couponId") || 0);
    const coupon = (
      await query<{ id: number; name: string }>(
        "SELECT uc.id, c.name FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.id = ? AND uc.user_id = ? AND uc.status = 'active' AND uc.remaining_uses > 0 AND uc.expires_at > NOW() LIMIT 1",
        [couponId, userId],
      )
    )[0];
    return coupon ? { refId: String(coupon.id), title: coupon.name } : null;
  }

  if (purpose === "entitlement") {
    const entitlementId = Number(req.nextUrl.searchParams.get("entitlementId") || 0);
    const entitlement = (
      await query<{ id: number; title: string }>(
        "SELECT id, title FROM user_entitlements WHERE id = ? AND user_id = ? AND status = 'active' AND starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW()) AND (remaining_uses IS NULL OR remaining_uses > 0) LIMIT 1",
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
