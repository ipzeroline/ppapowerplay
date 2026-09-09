import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { bookingSlots, expirePendingBookings, isPastSlot, rateForSlot } from "@/lib/booking-rules";
import { checkRateLimit, clientIp, secureResponse, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  sport: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationHours: z.coerce.number().int().min(1).max(4).default(1),
});

export async function GET(req: Request) {
  const limited = checkRateLimit({ key: `availability:${await clientIp()}`, limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  try {
    await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const url = new URL(req.url);
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse({ sport: url.searchParams.get("sport"), date: url.searchParams.get("date"), durationHours: url.searchParams.get("durationHours") || 1 });
  } catch (error) {
    return validationErrorResponse(error);
  }
  await expirePendingBookings();
  const sports = await query<{ id: number; baseRate: number }>(
    "SELECT id, base_rate baseRate FROM sports WHERE slug = ? OR name_th = ? LIMIT 1",
    [input.sport, input.sport],
  );
  if (!sports[0]) return secureResponse(NextResponse.json({ courts: [], slots: [] }));

  const courts = await query<{ id: number; name: string; capacity: number; hourlyRate?: number | null; zone?: string | null }>(
    "SELECT id, name, zone, capacity, hourly_rate hourlyRate FROM courts WHERE sport_id = ? AND status = 'available' ORDER BY sort_order, id",
    [sports[0].id],
  );
  const booked = await query<{ courtId: number; startsAt: string; endsAt: string }>(
    "SELECT court_id courtId, starts_at startsAt, ends_at endsAt FROM bookings WHERE sport_id = ? AND DATE(starts_at) = ? AND status IN ('hold','pending_payment','paid','checked_in')",
    [sports[0].id, input.date],
  );
  const overlaps = (courtId: number, time: string) => {
    const startsAt = new Date(`${input.date}T${time}:00+07:00`).getTime();
    const endsAt = startsAt + input.durationHours * 60 * 60 * 1000;
    return booked.some((booking) => {
      if (Number(booking.courtId) !== Number(courtId)) return false;
      const bookedStart = new Date(booking.startsAt).getTime();
      const bookedEnd = new Date(booking.endsAt).getTime();
      return startsAt < bookedEnd && endsAt > bookedStart;
    });
  };

  return secureResponse(NextResponse.json({
    courts,
    slots: courts.flatMap((court) =>
      bookingSlots.map((time) => ({
        courtId: court.id,
        courtName: court.name,
        zone: court.zone,
        capacity: court.capacity,
        time,
        available: !isPastSlot(input.date, time) && !overlaps(court.id, time),
        rate: rateForSlot(Number(sports[0].baseRate), time, input.durationHours, court.hourlyRate),
      })),
    ),
  }));
}
