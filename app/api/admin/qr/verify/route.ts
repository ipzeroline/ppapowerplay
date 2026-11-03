import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest, getAdminIdentity, adminSessionCookieName, hasAdminPermission } from "@/lib/admin-auth";
import { extractQrToken, hashQrToken } from "@/lib/qr";
import { pool } from "@/lib/db";
import { MEMBERSHIP_NOT_PAUSED } from "@/lib/renewals";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  token: z.string().min(32).max(500),
  consume: z.boolean().optional(),
});

type QrRow = {
  id: number;
  userId: number;
  purpose: "member" | "booking" | "coupon" | "entitlement" | "payment";
  refId: string | null;
  expiresAt: string;
  usedAt: string | null;
  expired: number;
  consumeExpired?: number;
  displayName: string;
  memberCode: string;
};

// What the QR grants, shown to staff before they confirm (read without locks, preview only).
const details: Record<string, string> = {
  booking: "SELECT title, DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i') startsAt, DATE_FORMAT(ends_at, '%H:%i') endsAt, starts_at < CURDATE() + INTERVAL 1 DAY checkInToday FROM bookings WHERE booking_no = ? AND user_id = ? LIMIT 1",
  coupon: "SELECT c.name title, uc.remaining_uses remainingUses, DATE_FORMAT(uc.expires_at, '%Y-%m-%d') expiresAt FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.id = ? AND uc.user_id = ? LIMIT 1",
  entitlement: "SELECT title, remaining_uses remainingUses, DATE_FORMAT(ends_at, '%Y-%m-%d') expiresAt FROM user_entitlements WHERE id = ? AND user_id = ? LIMIT 1",
  member: `SELECT plan_name title, DATE_FORMAT(ends_at, '%Y-%m-%d') expiresAt FROM memberships WHERE id = ? AND user_id = ? AND ${MEMBERSHIP_NOT_PAUSED} LIMIT 1`,
  payment: "SELECT payment_no title, amount, status FROM payments WHERE payment_no = ? AND user_id = ? LIMIT 1",
};

// Label stored with each visit (payment QRs are never consumed, so they have no visit).
const visitTitle: Record<string, string> = {
  booking: "SELECT title FROM bookings WHERE booking_no = ? AND user_id = ? LIMIT 1",
  coupon: "SELECT c.name FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.id = ? AND uc.user_id = ? LIMIT 1",
  entitlement: "SELECT title FROM user_entitlements WHERE id = ? AND user_id = ? LIMIT 1",
  member: `SELECT plan_name FROM memberships WHERE id = ? AND user_id = ? AND ${MEMBERSHIP_NOT_PAUSED} LIMIT 1`,
};

export async function POST(req: NextRequest) {
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

  const token = extractQrToken(input.token);
  if (!token) return secureResponse(NextResponse.json({ message: "QR token ไม่ถูกต้อง" }, { status: 400 }));

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      // The member's screen shows a new QR every 20 s; staff who previewed one may confirm it for two
      // more minutes after it expired. A QR first shown after it expired is refused.
      "SELECT qt.id, qt.user_id userId, qt.purpose, qt.ref_id refId, qt.expires_at expiresAt, qt.used_at usedAt, qt.expires_at <= NOW() expired, qt.expires_at <= NOW() - INTERVAL 2 MINUTE consumeExpired, u.display_name displayName, u.member_code memberCode FROM qr_tokens qt JOIN users u ON u.id = qt.user_id WHERE qt.token_hash = ? AND u.status = 'active' FOR UPDATE",
      [hashQrToken(token)],
    );
    const qr = (rows as QrRow[])[0];
    if (!qr) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "ไม่พบ QR" }, { status: 404 }));
    }
    const tooOld = input.consume ? Number(qr.consumeExpired ?? qr.expired) : Number(qr.expired);
    if (qr.usedAt || tooOld) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "QR หมดอายุหรือถูกใช้แล้ว", qr }, { status: 409 }));
    }

    let consumed = false;
    const permission = qr.purpose === "coupon" ? "coupons.manage" : qr.purpose === "payment" ? "payments.manage" : "bookings.manage";
    if (!hasAdminPermission(admin, permission)) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "Permission denied" }, { status: 403 }));
    }
    // Re-check the underlying right on preview as well as redemption.
    const eligibility: Record<string, string> = {
      booking: "SELECT id FROM bookings WHERE booking_no = ? AND user_id = ? AND status = 'paid' AND ends_at > NOW() FOR UPDATE",
      coupon: "SELECT id FROM user_coupons WHERE id = ? AND user_id = ? AND status = 'active' AND remaining_uses > 0 AND expires_at > NOW() FOR UPDATE",
      entitlement: "SELECT id FROM user_entitlements WHERE id = ? AND user_id = ? AND status = 'active' AND starts_at <= NOW() AND (remaining_uses IS NULL OR remaining_uses > 0) AND (ends_at IS NULL OR ends_at > NOW()) FOR UPDATE",
      member: `SELECT id FROM memberships WHERE id = ? AND user_id = ? AND status = 'active' AND starts_at <= NOW() AND ends_at > NOW() AND ${MEMBERSHIP_NOT_PAUSED} FOR UPDATE`,
      payment: "SELECT id FROM payments WHERE payment_no = ? AND user_id = ? FOR UPDATE",
    };
    if (!qr.refId || !eligibility[qr.purpose]) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "สิทธิ์นี้ใช้ไม่ได้แล้ว" }, { status: 409 }));
    }
    const [rights] = await conn.execute(eligibility[qr.purpose], [qr.refId, qr.userId]);
    if (!(rights as unknown[]).length || (input.consume && qr.purpose === "payment")) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "สิทธิ์นี้ใช้ไม่ได้แล้ว" }, { status: 409 }));
    }
    if (input.consume) {
      let affectedRows = 0;
      await conn.execute("UPDATE qr_tokens SET used_at = NOW() WHERE id = ?", [qr.id]);
      if (qr.purpose === "booking" && qr.refId) {
        // Only on the booking's own day: a QR for next week's booking is not checked in today.
        const [result] = await conn.execute("UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE booking_no = ? AND user_id = ? AND status = 'paid' AND ends_at > NOW() AND starts_at < CURDATE() + INTERVAL 1 DAY", [qr.refId, qr.userId]);
        affectedRows = (result as { affectedRows: number }).affectedRows;
        if (!affectedRows) {
          const [later] = await conn.execute("SELECT DATE_FORMAT(starts_at, '%e/%c %H:%i') startsAt FROM bookings WHERE booking_no = ? AND user_id = ? AND status = 'paid' AND ends_at > NOW() LIMIT 1", [qr.refId, qr.userId]);
          const startsAt = (later as { startsAt: string }[])[0]?.startsAt;
          if (startsAt) {
            await conn.rollback();
            return secureResponse(NextResponse.json({ message: `การจองนี้เริ่ม ${startsAt} น. เช็คอินได้ในวันที่จอง` }, { status: 409 }));
          }
        }
      }
      if (qr.purpose === "coupon" && qr.refId) {
        const [result] = await conn.execute(
          "UPDATE user_coupons SET status = IF(remaining_uses <= 1, 'used', status), remaining_uses = remaining_uses - 1 WHERE id = ? AND user_id = ? AND status = 'active' AND remaining_uses > 0 AND expires_at > NOW()",
          [Number(qr.refId), qr.userId],
        );
        affectedRows = (result as { affectedRows: number }).affectedRows;
      }
      if (qr.purpose === "entitlement" && qr.refId) {
        const [result] = await conn.execute(
          "UPDATE user_entitlements SET status = IF(remaining_uses IS NOT NULL AND remaining_uses <= 1, 'used', status), remaining_uses = IF(remaining_uses IS NULL, NULL, remaining_uses - 1) WHERE id = ? AND user_id = ? AND status = 'active' AND starts_at <= NOW() AND (remaining_uses IS NULL OR remaining_uses > 0) AND (ends_at IS NULL OR ends_at > NOW())",
          [Number(qr.refId), qr.userId],
        );
        affectedRows = (result as { affectedRows: number }).affectedRows;
      }
      if (qr.purpose === "member" && qr.refId) {
        const [memberships] = await conn.execute(`SELECT id FROM memberships WHERE id = ? AND user_id = ? AND status = 'active' AND starts_at <= NOW() AND ends_at > NOW() AND ${MEMBERSHIP_NOT_PAUSED} FOR UPDATE`, [qr.refId, qr.userId]);
        affectedRows = (memberships as unknown[]).length;
      }
      if (!affectedRows) {
        await conn.rollback();
        return secureResponse(NextResponse.json({ message: "สิทธิ์นี้ใช้ไม่ได้แล้ว" }, { status: 409 }));
      }
      await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'qr.consume', 'qr_token', ?, JSON_OBJECT('purpose', ?, 'refId', ?))", [
        admin.id,
        qr.id,
        qr.purpose,
        qr.refId,
      ]);
      // The member's visit history (bootstrap "visits"), titled with the right that was used.
      await conn.execute(
        `INSERT INTO member_visits (user_id, purpose, ref_id, title, staff_id, qr_token_id) VALUES (?, ?, ?, (${visitTitle[qr.purpose]}), ?, ?)`,
        [qr.userId, qr.purpose, qr.refId, qr.refId, qr.userId, admin.id, qr.id],
      );
      consumed = true;
    }

    let detail: Record<string, unknown> | undefined;
    if (!input.consume && details[qr.purpose]) {
      const [found] = await conn.execute(details[qr.purpose], [qr.refId, qr.userId]);
      const row = (found as Record<string, unknown>[])[0];
      if (row) {
        const { checkInToday, ...rest } = row;
        detail = qr.purpose === "booking" && checkInToday !== undefined ? { ...rest, checkInOpen: Boolean(Number(checkInToday)) } : rest;
      }
    }
    await conn.commit();
    return secureResponse(NextResponse.json({ valid: true, consumed, qr, detail }));
  } catch {
    await conn?.rollback().catch(() => {});
    return secureResponse(NextResponse.json({ message: "บริการ QR ไม่พร้อมใช้งาน กรุณาตรวจประวัติก่อนลองใหม่" }, { status: 503 }));
  } finally {
    conn?.release();
  }
}

