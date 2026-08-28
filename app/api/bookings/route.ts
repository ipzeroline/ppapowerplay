import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool, query } from "@/lib/db";

const schema = z.object({
  sportSlug: z.string().min(1),
  courtId: z.number().int().positive().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  players: z.number().int().min(1).max(20).default(1),
  title: z.string().min(1).max(180),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const input = schema.parse(await req.json());
  const sports = await query<{ id: number; baseRate: number; name: string }>(
    "SELECT id, base_rate baseRate, name_th name FROM sports WHERE slug = ? LIMIT 1",
    [input.sportSlug],
  );
  if (!sports[0]) return NextResponse.json({ message: "ไม่พบกีฬา" }, { status: 404 });

  const hour = Number(input.time.slice(0, 2));
  const amount = hour >= 17 ? Number(sports[0].baseRate) * 1.5 : Number(sports[0].baseRate);
  const startsAt = `${input.date} ${input.time}:00`;
  const endsAt = `${input.date} ${String(hour + 1).padStart(2, "0")}:00:00`;
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
      [bookingNo, user.id, sports[0].id, input.courtId, input.title, startsAt, endsAt, input.players, amount, qrSecret],
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
