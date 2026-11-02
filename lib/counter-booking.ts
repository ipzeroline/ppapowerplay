import { z } from "zod";
import { requestIdPattern } from "@/lib/request-id";

// Staff booking at the counter (AdminConsole court calendar): a member or a walk-in guest,
// optionally the same slot every week, paid now (cash / card / transfer) or held to pay later.
export const counterBookingSchema = z.object({
  courtId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):00$/),
  durationHours: z.number().int().min(1).max(4),
  players: z.number().int().min(1).max(20),
  customer: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("member"), userId: z.number().int().positive() }),
    z.object({ kind: z.literal("guest"), name: z.string().trim().min(1).max(160), phone: z.string().trim().regex(/^\+?[0-9][0-9 -]{5,19}$/) }),
  ]),
  repeatWeeks: z.number().int().min(1).max(12),
  payNow: z.object({ method: z.enum(["cash", "card", "promptpay"]) }).nullable(),
  note: z.string().trim().max(200).optional(),
  requestId: z.string().regex(requestIdPattern),
});

export type CounterBooking = z.infer<typeof counterBookingSchema>;

// One date per week starting at `date` (YYYY-MM-DD, calendar arithmetic in UTC so no DST/zone drift).
export function weeklyDates(date: string, weeks: number) {
  const start = Date.parse(`${date}T00:00:00Z`);
  return Array.from({ length: weeks }, (_, index) => new Date(start + index * 7 * 86_400_000).toISOString().slice(0, 10));
}

// Taking the payment for a held counter booking at the counter.
export const counterPaymentSchema = z.object({
  bookingNo: z.string().trim().min(4).max(32),
  method: z.enum(["cash", "card", "promptpay"]),
  requestId: z.string().regex(requestIdPattern),
});
