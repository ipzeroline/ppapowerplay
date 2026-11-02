import { z } from "zod";

// A real calendar day (rejects 2099-02-30), YYYY-MM-DD.
export function isCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}

export function nextDay(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// Court block (maintenance, event, private hire): whole hours inside opening hours 08:00-23:00.
export const courtBlockSchema = z.object({
  courtId: z.number().int().positive(),
  date: z.string().refine(isCalendarDate),
  from: z.string().regex(/^(0[89]|1\d|2[0-2]):00$/),
  to: z.string().regex(/^(09|1\d|2[0-3]):00$/),
  reason: z.string().trim().min(1).max(160),
}).refine((input) => input.from < input.to, { message: "The block must end after it starts" });

export type CourtBlockInput = z.infer<typeof courtBlockSchema>;
