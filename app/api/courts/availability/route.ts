import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";

const schema = z.object({
  sport: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const slots = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];

export async function GET(req: Request) {
  try {
    await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const url = new URL(req.url);
  const input = schema.parse({ sport: url.searchParams.get("sport"), date: url.searchParams.get("date") });
  const sports = await query<{ id: number; baseRate: number }>(
    "SELECT id, base_rate baseRate FROM sports WHERE slug = ? OR name_th = ? LIMIT 1",
    [input.sport, input.sport],
  );
  if (!sports[0]) return NextResponse.json({ courts: [], slots: [] });

  const courts = await query<{ id: number; name: string; capacity: number }>(
    "SELECT id, name, capacity FROM courts WHERE sport_id = ? AND status = 'available' ORDER BY id",
    [sports[0].id],
  );
  const booked = await query<{ courtId: number; startsAt: string }>(
    "SELECT court_id courtId, starts_at startsAt FROM bookings WHERE sport_id = ? AND DATE(starts_at) = ? AND status IN ('hold','pending_payment','paid','checked_in')",
    [sports[0].id, input.date],
  );
  const taken = new Set(booked.map((b) => `${b.courtId}-${new Date(b.startsAt).getHours().toString().padStart(2, "0")}:00`));
  const rateFor = (time: string) => {
    const hour = Number(time.slice(0, 2));
    return hour >= 17 ? Number(sports[0].baseRate) * 1.5 : Number(sports[0].baseRate);
  };

  return NextResponse.json({
    courts,
    slots: courts.flatMap((court) =>
      slots.map((time) => ({
        courtId: court.id,
        courtName: court.name,
        time,
        available: !taken.has(`${court.id}-${time}`),
        rate: rateFor(time),
      })),
    ),
  });
}
