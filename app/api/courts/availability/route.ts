import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { bookingSlots, buildSlotRange, rateForSlot } from "@/lib/booking-rules";
import { datesInMonth, slotStatus, summarizeDay, type Court, type Occupancy } from "@/lib/court-availability";
import { checkRateLimit, clientIp, secureResponse, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  sport: z.string().min(1).max(80),
  date: z.string().optional(),
  month: z.string().optional(),
  durationHours: z.coerce.number().int().min(1).max(4).default(1),
}).refine((input) => Boolean(input.date) !== Boolean(input.month), "Provide date or month")
  .refine((input) => input.date ? Boolean(buildSlotRange(input.date, "08:00")) : datesInMonth(input.month || "").length > 0, "Invalid calendar date");

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
    input = schema.parse(Object.fromEntries(url.searchParams));
  } catch (error) {
    return validationErrorResponse(error);
  }
  const dates = input.date ? [input.date] : datesInMonth(input.month!);
  const sports = await query<{ id: number; baseRate: number }>(
    "SELECT id, base_rate baseRate FROM sports WHERE (slug = ? OR name_th = ?) AND active = TRUE LIMIT 1",
    [input.sport, input.sport],
  );
  if (!sports[0]) return secureResponse(NextResponse.json({ message: "ไม่พบกีฬาที่เปิดให้จอง" }, { status: 404 }));

  const courts = await query<Court>(
    "SELECT id, name, zone, capacity, hourly_rate hourlyRate FROM courts WHERE sport_id = ? AND status = 'available' ORDER BY sort_order, id",
    [sports[0].id],
  );
  // Read only, with one bounded range query and no expired holds blocking dates.
  const booked = await query<Occupancy>(
    "SELECT court_id courtId, DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') startsAt, DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') endsAt FROM bookings WHERE sport_id = ? AND starts_at < ? AND ends_at > ? AND (status IN ('paid','checked_in') OR (status IN ('hold','pending_payment') AND (expires_at IS NULL OR expires_at > NOW())))",
    [sports[0].id, `${dates.at(-1)} 23:59:59`, `${dates[0]} 00:00:00`],
  );
  const now = Date.now();
  const slotsFor = (date: string) => courts.flatMap((court) => bookingSlots.map((time) => {
    const status = slotStatus(date, time, input.durationHours, court.id, booked, now);
    return { courtId: court.id, courtName: court.name, zone: court.zone, capacity: court.capacity, time, status,
      available: status === "available", rate: rateForSlot(Number(sports[0].baseRate), time, input.durationHours, court.hourlyRate) };
  }));
  if (input.month) {
    const days = dates.map((date) => summarizeDay(date, slotsFor(date).map((slot) => slot.status), now));
    return secureResponse(NextResponse.json({ month: input.month, days }));
  }
  return secureResponse(NextResponse.json({ date: input.date, courts, slots: slotsFor(input.date!) }));
}
