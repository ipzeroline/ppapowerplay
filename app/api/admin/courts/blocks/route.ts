import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookieName, assertAdminRequest, getAdminIdentity } from "@/lib/admin-auth";
import { courtBlockSchema, type CourtBlockInput } from "@/lib/court-blocks";
import { takenBookingAs } from "@/lib/court-schedule";
import { pool } from "@/lib/db";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";

const json = (body: unknown, status = 200) => secureResponse(NextResponse.json(body, { status }));

// Block a court for maintenance, an event or private hire. Refused while active bookings overlap:
// staff move or cancel those first, so no member loses a paid slot silently.
export async function POST(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const admin = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return json({ message: "Admin access denied" }, 401);
  let input: CourtBlockInput;
  try {
    input = await parseJsonBody(request, courtBlockSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  const startsAt = `${input.date} ${input.from}:00`;
  const endsAt = `${input.date} ${input.to}:00`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [courts] = await conn.execute("SELECT id FROM courts WHERE id = ? FOR UPDATE", [input.courtId]);
    if (!(courts as unknown[]).length) {
      await conn.rollback();
      return json({ message: "ไม่พบสนาม" }, 404);
    }
    const [overlapping] = await conn.execute(
      `SELECT b.booking_no bookingNo, DATE_FORMAT(b.starts_at, '%Y-%m-%d %H:%i:%s') startsAt, COALESCE(b.guest_name, u.display_name) name FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.court_id = ? AND (${takenBookingAs("b")}) AND b.starts_at < ? AND b.ends_at > ? FOR UPDATE`,
      [input.courtId, endsAt, startsAt],
    );
    if ((overlapping as unknown[]).length) {
      await conn.rollback();
      return json({ message: "มีการจองในช่วงเวลานี้ ย้ายหรือยกเลิกการจองก่อนบล็อกสนาม", bookings: overlapping }, 409);
    }
    // One block per time on a court: a block inside another would be hidden in the calendar.
    const [blocked] = await conn.execute(
      "SELECT id, DATE_FORMAT(starts_at, '%H:%i') startsAt, DATE_FORMAT(ends_at, '%H:%i') endsAt, reason FROM court_blocks WHERE court_id = ? AND cancelled_at IS NULL AND starts_at < ? AND ends_at > ? LIMIT 1 FOR UPDATE",
      [input.courtId, endsAt, startsAt],
    );
    const existing = (blocked as { startsAt: string; endsAt: string; reason: string }[])[0];
    if (existing) {
      await conn.rollback();
      return json({ message: `สนามนี้มีการบล็อกช่วงนี้อยู่แล้ว (${existing.startsAt}–${existing.endsAt} ${existing.reason}) ยกเลิกการบล็อกเดิมก่อน หรือเลือกเวลาอื่น` }, 409);
    }
    const [result] = await conn.execute("INSERT INTO court_blocks (court_id, starts_at, ends_at, reason, created_by) VALUES (?, ?, ?, ?, ?)", [input.courtId, startsAt, endsAt, input.reason, admin.id]);
    const id = Number((result as { insertId?: number }).insertId || 0);
    await conn.execute(
      "INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'court.block', 'court', ?, ?)",
      [admin.id, String(input.courtId), JSON.stringify({ blockId: id, startsAt, endsAt, reason: input.reason })],
    );
    await conn.commit();
    return json({ id }, 201);
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const admin = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return json({ message: "Admin access denied" }, 401);
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[1-9]\d{0,14}$/.test(id)) return json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, 400);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute("UPDATE court_blocks SET cancelled_at = NOW() WHERE id = ? AND cancelled_at IS NULL", [Number(id)]);
    if (!Number((result as { affectedRows?: number }).affectedRows)) {
      await conn.rollback();
      return json({ message: "ไม่พบการบล็อกสนามนี้" }, 404);
    }
    await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'court.unblock', 'court_block', ?, NULL)", [admin.id, id]);
    await conn.commit();
    return json({ ok: true });
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}
