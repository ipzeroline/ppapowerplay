// Court price for one booking, shared by the booking routes, the member app and the counter
// calendar (this module has no server imports): the court's own hourly rate, or the sport's base
// rate, ×1.5 from 17:00, × hours.
export function rateForSlot(baseRate: number, time: string, durationHours = 1, courtRate?: number | null) {
  const hour = Number(time.slice(0, 2));
  const base = Number(courtRate || baseRate || 0);
  const multiplier = hour >= 17 ? 1.5 : 1;
  return Math.round(base * multiplier * durationHours);
}
