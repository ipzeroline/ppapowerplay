import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
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
  const adminError = assertAdminRequest(req);
  if (adminError) return adminError;

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
      "SELECT qt.id, qt.user_id userId, qt.purpose, qt.ref_id refId, qt.expires_at expiresAt, qt.used_at usedAt, qt.expires_at < NOW() expired, u.display_name displayName, u.member_code memberCode FROM qr_tokens qt JOIN users u ON u.id = qt.user_id WHERE qt.token_hash = ? FOR UPDATE",
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
    if (input.consume) {
      await conn.execute("UPDATE qr_tokens SET used_at = NOW() WHERE id = ?", [qr.id]);
      if (qr.purpose === "booking" && qr.refId) {
        await conn.execute("UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE booking_no = ? AND user_id = ? AND status = 'paid'", [qr.refId, qr.userId]);
      }
      if (qr.purpose === "coupon" && qr.refId) {
        await conn.execute(
          "UPDATE user_coupons SET remaining_uses = remaining_uses - 1, status = IF(remaining_uses <= 1, 'used', status) WHERE id = ? AND user_id = ? AND status = 'active' AND remaining_uses > 0",
          [Number(qr.refId), qr.userId],
        );
      }
      if (qr.purpose === "entitlement" && qr.refId) {
        await conn.execute(
          "UPDATE user_entitlements SET remaining_uses = IF(remaining_uses IS NULL, NULL, remaining_uses - 1), status = IF(remaining_uses IS NOT NULL AND remaining_uses <= 1, 'used', status) WHERE id = ? AND user_id = ? AND status = 'active' AND (remaining_uses IS NULL OR remaining_uses > 0)",
          [Number(qr.refId), qr.userId],
        );
      }
      await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (NULL, 'qr.consume', 'qr_token', ?, JSON_OBJECT('purpose', ?, 'refId', ?))", [
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
