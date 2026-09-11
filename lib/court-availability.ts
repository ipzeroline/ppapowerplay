export type AvailabilityStatus = "available" | "full" | "past" | "closed";
export type CalendarDay = { date: string; status: AvailabilityStatus; availableSlots: number };
export type Court = { id: number; name: string; capacity: number; hourlyRate?: number | null; zone?: string | null };
export type Occupancy = { courtId: number; startsAt: string; endsAt: string };

export function bangkokToday(now = Date.now()) {
  return new Date(now + 7 * 3600000).toISOString().slice(0, 10);
}

export function datesInMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1000) return [];
  const start = new Date(`${month}-01T00:00:00Z`);
  const result: string[] = [];
  for (let day = 0; day < 31; day++) {
    const date = new Date(start.getTime() + day * 86400000).toISOString().slice(0, 10);
    if (!date.startsWith(month)) break;
    result.push(date);
  }
  return result;
}

// SQL DATETIME is a Bangkok wall-clock value, not a browser-local timestamp.
export function slotStatus(date: string, time: string, duration: number, courtId: number, bookings: Occupancy[], now = Date.now()): AvailabilityStatus {
  const start = `${date} ${time}:00`;
  const hour = Number(time.slice(0, 2));
  if (hour + duration > 23) return "closed";
  if (new Date(`${date}T${time}:00+07:00`).getTime() < now) return "past";
  const end = `${date} ${String(hour + duration).padStart(2, "0")}:00:00`;
  return bookings.some((booking) => Number(booking.courtId) === Number(courtId) && start < booking.endsAt && end > booking.startsAt) ? "full" : "available";
}

export function summarizeDay(date: string, statuses: AvailabilityStatus[], now = Date.now()): CalendarDay {
  const availableSlots = statuses.filter((status) => status === "available").length;
  const status = date < bangkokToday(now) ? "past" : availableSlots ? "available"
    : statuses.includes("full") ? "full" : statuses.includes("past") ? "past" : "closed";
  return { date, status, availableSlots };
}
