import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool, query } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";
import { buildSlotRange, expirePendingBookings, isPastSlot, rateForSlot } from "@/lib/booking-rules";

const schema = z.object({
  sportSlug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  courtId: z.coerce.number().int().positive().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationHours: z.coerce.number().int().min(1).max(4).default(1),
  players: z.coerce.number().int().min(1).max(20).default(1),
  title: z.string().trim().min(1).max(180).optional(),
});
const cancelSchema = z.object({
  bookingNo: z.string().trim().min(4).max(32),
  reason: z.string().trim().max(255).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `booking:${await clientIp()}`, limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  let input: z.infer<typeof schema>;
  try {
    input = await parseJsonBody(req, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  await expirePendingBookings();
  const sports = await query<{ id: number; baseRate: number; name: string; requiresBooking: number | boolean }>(
    "SELECT id, base_rate baseRate, name_th name, requires_booking requiresBooking FROM sports WHERE slug = ? AND active = TRUE LIMIT 1",
    [input.sportSlug],
  );
  if (!sports[0]) return NextResponse.json({ message: "ไม่พบกีฬา" }, { status: 404 });
  if (isPastSlot(input.date, input.time)) return NextResponse.json({ message: "ไม่สามารถจองเวลาย้อนหลังได้" }, { status: 400 });

  const court = input.courtId
    ? (
        await query<{ id: number; name: string; capacity: number; hourlyRate?: number | null }>(
          "SELECT id, name, capacity, hourly_rate hourlyRate FROM courts WHERE id = ? AND sport_id = ? AND status = 'available' LIMIT 1",
          [input.courtId, sports[0].id],
        )
      )[0]
    : null;
  if (input.courtId && !court) return NextResponse.json({ message: "ไม่พบคอร์ทที่เปิดให้จองสำหรับกีฬานี้" }, { status: 404 });
  if (sports[0].requiresBooking && !input.courtId) return NextResponse.json({ message: "กรุณาเลือกสนามก่อนจอง" }, { status: 400 });
  if (court && input.players > court.capacity) return NextResponse.json({ message: "จำนวนผู้เล่นเกินความจุสนาม" }, { status: 400 });

  const range = buildSlotRange(input.date, input.time, input.durationHours);
  if (!range) return NextResponse.json({ message: "ช่วงเวลานี้ไม่เปิดให้จอง" }, { status: 400 });
  let amount = rateForSlot(Number(sports[0].baseRate), input.time, input.durationHours, court?.hourlyRate);
  const { startsAt, endsAt } = range;
  const title = input.title?.trim() || `${sports[0].name}${court ? ` - ${court.name}` : ""}`;
  const bookingNo = createPublicId("BK");
  const qrSecret = createPublicId("QR");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (input.courtId) {
      const [lockedCourts] = await conn.execute("SELECT id, capacity, hourly_rate hourlyRate FROM courts WHERE id = ? AND sport_id = ? AND status = 'available' FOR UPDATE", [input.courtId, sports[0].id]);
      const lockedCourt = (lockedCourts as { id: number; capacity: number; hourlyRate: number | null }[])[0];
      if (!lockedCourt || input.players > lockedCourt.capacity || isPastSlot(input.date, input.time)) {
        await conn.rollback();
        return NextResponse.json({ message: "สนามหรือช่วงเวลานี้ไม่พร้อมให้จอง กรุณาเลือกใหม่" }, { status: 409 });
      }
      amount = rateForSlot(Number(sports[0].baseRate), input.time, input.durationHours, lockedCourt.hourlyRate);
      const [rows] = await conn.execute(
        "SELECT id FROM bookings WHERE court_id = ? AND (status IN ('paid','checked_in') OR (status IN ('hold','pending_payment') AND (expires_at IS NULL OR expires_at > NOW()))) AND starts_at < ? AND ends_at > ? FOR UPDATE",
        [input.courtId, endsAt, startsAt],
      );
      if ((rows as unknown[]).length) {
        await conn.rollback();
        return NextResponse.json({ message: "ช่วงเวลานี้ถูกจองแล้ว" }, { status: 409 });
      }
    }
    await conn.execute(
      "INSERT INTO bookings (booking_no, user_id, sport_id, court_id, title, starts_at, ends_at, players, amount, status, qr_secret, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))",
      [bookingNo, user.id, sports[0].id, input.courtId || null, title, startsAt, endsAt, input.players, amount, qrSecret],
    );
    const [booking] = await conn.execute("SELECT * FROM bookings WHERE booking_no = ? LIMIT 1", [bookingNo]);
    await conn.commit();
    return NextResponse.json({ booking: (booking as unknown[])[0] }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function DELETE(req: Request) {
  const limited = checkRateLimit({ key: `booking-cancel:${await clientIp()}`, limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  let input: z.infer<typeof cancelSchema>;
  try {
    input = await parseJsonBody(req, cancelSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  const booking = (
    await query<{ id: number; status: string; startsAt: string }>(
      "SELECT id, status, starts_at startsAt FROM bookings WHERE booking_no = ? AND user_id = ? LIMIT 1",
      [input.bookingNo, user.id],
    )
  )[0];
  if (!booking) return NextResponse.json({ message: "ไม่พบรายการจอง" }, { status: 404 });
  if (["checked_in", "cancelled", "expired"].includes(booking.status)) return NextResponse.json({ message: "รายการนี้ยกเลิกไม่ได้" }, { status: 409 });
  if (new Date(booking.startsAt).getTime() < Date.now() + 30 * 60 * 1000) return NextResponse.json({ message: "ยกเลิกได้ก่อนเวลาใช้งานอย่างน้อย 30 นาที" }, { status: 409 });
  const result = await query("UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = ? WHERE id = ? AND status IN ('hold','pending_payment','paid') AND starts_at >= DATE_ADD(NOW(), INTERVAL 30 MINUTE)", [input.reason || "member cancelled", booking.id]);
  if (!(result as unknown as { affectedRows: number }).affectedRows) return NextResponse.json({ message: "Booking state changed" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
