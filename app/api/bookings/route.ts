import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool, query } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  sportSlug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  courtId: z.number().int().positive().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  players: z.number().int().min(1).max(20).default(1),
  title: z.string().min(1).max(180).optional(),
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
  const sports = await query<{ id: number; baseRate: number; name: string }>(
    "SELECT id, base_rate baseRate, name_th name FROM sports WHERE slug = ? LIMIT 1",
    [input.sportSlug],
  );
  if (!sports[0]) return NextResponse.json({ message: "ไม่พบกีฬา" }, { status: 404 });
  if (isPastSlot(input.date, input.time)) return NextResponse.json({ message: "ไม่สามารถจองเวลาย้อนหลังได้" }, { status: 400 });

  const court = input.courtId
    ? (
        await query<{ id: number; name: string }>(
          "SELECT id, name FROM courts WHERE id = ? AND sport_id = ? AND status = 'available' LIMIT 1",
          [input.courtId, sports[0].id],
        )
      )[0]
    : null;
  if (input.courtId && !court) return NextResponse.json({ message: "ไม่พบคอร์ทที่เปิดให้จองสำหรับกีฬานี้" }, { status: 404 });

  const hour = Number(input.time.slice(0, 2));
  if (hour >= 23) return NextResponse.json({ message: "ช่วงเวลานี้ไม่เปิดให้จอง" }, { status: 400 });
  const amount = hour >= 17 ? Number(sports[0].baseRate) * 1.5 : Number(sports[0].baseRate);
  const startsAt = `${input.date} ${input.time}:00`;
  const endsAt = `${input.date} ${String(hour + 1).padStart(2, "0")}:00:00`;
  const title = input.title?.trim() || `${sports[0].name}${court ? ` - ${court.name}` : ""}`;
  const bookingNo = createPublicId("BK");
  const qrSecret = createPublicId("QR");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (input.courtId) {
      const [rows] = await conn.execute(
        "SELECT id FROM bookings WHERE court_id = ? AND starts_at = ? AND ends_at = ? AND status IN ('hold','pending_payment','paid','checked_in') FOR UPDATE",
        [input.courtId, startsAt, endsAt],
      );
      if ((rows as unknown[]).length) {
        await conn.rollback();
        return NextResponse.json({ message: "ช่วงเวลานี้ถูกจองแล้ว" }, { status: 409 });
      }
    }
    await conn.execute(
      "INSERT INTO bookings (booking_no, user_id, sport_id, court_id, title, starts_at, ends_at, players, amount, status, qr_secret, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))",
      [bookingNo, user.id, sports[0].id, input.courtId, title, startsAt, endsAt, input.players, amount, qrSecret],
    );
    await conn.commit();
    const booking = await query("SELECT * FROM bookings WHERE booking_no = ? LIMIT 1", [bookingNo]);
    return NextResponse.json({ booking: booking[0] }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function isPastSlot(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`).getTime() < Date.now() - 60_000;
}
