import { query } from "@/lib/db";

export const bookingSlots = [
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
] as const;

export const activeBookingStatuses = ["hold", "pending_payment", "paid", "checked_in"] as const;

export function isPastSlot(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`).getTime() < Date.now() - 60_000;
}

export function buildSlotRange(date: string, time: string, durationHours = 1) {
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const start = new Date(`${date}T${time}:00+07:00`);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const closesAt = new Date(`${date}T23:00:00+07:00`);
  if (hour < 8 || hour >= 23 || minute !== 0 || end.getTime() > closesAt.getTime()) return null;
  return {
    startsAt: `${date} ${time}:00`,
    endsAt: `${date} ${String(end.getHours()).padStart(2, "0")}:00:00`,
  };
}

export function rateForSlot(baseRate: number, time: string, durationHours = 1, courtRate?: number | null) {
  const hour = Number(time.slice(0, 2));
  const base = Number(courtRate || baseRate || 0);
  const multiplier = hour >= 17 ? 1.5 : 1;
  return Math.round(base * multiplier * durationHours);
}

export async function expirePendingBookings() {
  await query(
    "UPDATE bookings SET status = 'expired' WHERE status IN ('hold','pending_payment') AND expires_at IS NOT NULL AND expires_at < NOW()",
  );
}
