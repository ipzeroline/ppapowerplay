import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest, getAdminIdentity, adminSessionCookieName, hasAdminPermission } from "@/lib/admin-auth";
import { hashQrToken } from "@/lib/qr";
import { pool } from "@/lib/db";
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
  displayName: string;
  memberCode: string;
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

  const token = extractToken(input.token);
  if (!token) return secureResponse(NextResponse.json({ message: "QR token ไม่ถูกต้อง" }, { status: 400 }));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT qt.id, qt.user_id userId, qt.purpose, qt.ref_id refId, qt.expires_at expiresAt, qt.used_at usedAt, qt.expires_at <= NOW() expired, u.display_name displayName, u.member_code memberCode FROM qr_tokens qt JOIN users u ON u.id = qt.user_id WHERE qt.token_hash = ? AND u.status = 'active' FOR UPDATE",
      [hashQrToken(token)],
    );
    const qr = (rows as QrRow[])[0];
    if (!qr) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "ไม่พบ QR" }, { status: 404 }));
    }
    if (qr.usedAt || Boolean(qr.expired)) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "QR หมดอายุหรือถูกใช้แล้ว", qr }, { status: 409 }));
    }

    let consumed = false;
    const permission = qr.purpose === "coupon" ? "coupons.manage" : qr.purpose === "payment" ? "payments.manage" : "bookings.manage";
    if (!hasAdminPermission(admin, permission)) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "Permission denied" }, { status: 403 }));
    }
    if (input.consume) {
      let affectedRows = 0;
      await conn.execute("UPDATE qr_tokens SET used_at = NOW() WHERE id = ?", [qr.id]);
      if (qr.purpose === "booking" && qr.refId) {
        const [result] = await conn.execute("UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE booking_no = ? AND user_id = ? AND status = 'paid'", [qr.refId, qr.userId]);
        affectedRows = (result as { affectedRows: number }).affectedRows;
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
          "UPDATE user_entitlements SET status = IF(remaining_uses IS NOT NULL AND remaining_uses <= 1, 'used', status), remaining_uses = IF(remaining_uses IS NULL, NULL, remaining_uses - 1) WHERE id = ? AND user_id = ? AND status = 'active' AND (remaining_uses IS NULL OR remaining_uses > 0) AND (ends_at IS NULL OR ends_at > NOW())",
          [Number(qr.refId), qr.userId],
        );
        affectedRows = (result as { affectedRows: number }).affectedRows;
      }
      if (qr.purpose === "member" && qr.refId) {
        const [memberships] = await conn.execute("SELECT id FROM memberships WHERE id = ? AND user_id = ? AND status = 'active' AND starts_at <= NOW() AND ends_at > NOW() FOR UPDATE", [qr.refId, qr.userId]);
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
      consumed = true;
    }

    await conn.commit();
    return secureResponse(NextResponse.json({ valid: true, consumed, qr }));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function extractToken(value: string) {
  try {
    const url = new URL(value);
    return url.searchParams.get("token") || "";
  } catch {
    return value.trim();
  }
}
