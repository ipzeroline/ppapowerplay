// Pure helpers for the member package, coupon and Find Your Game screens.
// Safe to import from client components (no server-only dependencies).

export function parseMeta(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

type Groupable = { id: number; sortOrder?: number | null; metadata?: unknown };
export type PackageGroup<T> = { key: string; base: T; extras: T[] };

const sortValue = (item: Groupable) => Number(item.sortOrder || 0);

// Group catalog rows into a base option with its "Extra" variants (Fitness + Swim, ...).
export function groupPackages<T extends Groupable>(items: T[]): PackageGroup<T>[] {
  const sorted = [...items].sort((a, b) => sortValue(a) - sortValue(b) || a.id - b.id);
  const groups = new Map<string, T[]>();
  for (const item of sorted) {
    const group = parseMeta(item.metadata).group;
    const key = typeof group === "string" && group.trim() ? group.trim() : `id-${item.id}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([key, members]) => {
    const base = members.find((item) => {
      const variant = parseMeta(item.metadata).variant;
      return variant === undefined || variant === null || variant === "" || variant === "base";
    }) || members[0];
    return { key, base, extras: members.filter((item) => item !== base) };
  });
}

export function validityLabel(days: number): { amount: number; unit: "day" | "month" | "year" } {
  const value = Math.max(0, Math.round(Number(days) || 0));
  if (value === 365 || value === 366) return { amount: 1, unit: "year" };
  if (value > 0 && value % 365 === 0) return { amount: value / 365, unit: "year" };
  if (value > 0 && value % 30 === 0) return { amount: value / 30, unit: "month" };
  return { amount: value, unit: "day" };
}

export function perUnit(price: number, count: number) {
  return count > 0 ? Math.round(Number(price || 0) / count) : 0;
}

export function usedCount(total: number, remaining: number) {
  return Math.max(0, Number(total || 0) - Number(remaining || 0));
}

export function remainingPercent(remaining: number, total: number) {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((Number(remaining || 0) / total) * 100)));
}

export function daysLeft(expiresAt: string | null | undefined, now: number) {
  const time = new Date(expiresAt || "").getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.ceil((time - now) / 86_400_000));
}

type Slot = { maxPlayers: number; memberCount: number; playAt?: string | null };

export function missingPlayers(group: Pick<Slot, "maxPlayers" | "memberCount">) {
  return Math.max(0, Number(group.maxPlayers || 0) - Number(group.memberCount || 0));
}

// Joinable Find Your Game slots: not full and not more than an hour past start.
export function openGameSlots<T extends Slot>(groups: T[], now: number, limit = 4): T[] {
  const startOf = (group: T) => {
    const time = new Date(group.playAt || "").getTime();
    return group.playAt && Number.isFinite(time) ? time : null;
  };
  return groups
    .filter((group) => {
      const start = startOf(group);
      return missingPlayers(group) > 0 && (start === null || start > now - 3_600_000);
    })
    .sort((a, b) => {
      const startA = startOf(a);
      const startB = startOf(b);
      if (startA !== startB) {
        if (startA === null) return 1;
        if (startB === null) return -1;
        return startA - startB;
      }
      return missingPlayers(a) - missingPlayers(b);
    })
    .slice(0, Math.max(0, limit));
}

// SQL DATETIME values are Bangkok wall-clock times; API JSON dates are ISO instants.
export function wallClockTime(value: unknown) {
  if (value instanceof Date) return value.getTime();
  const text = String(value || "");
  return Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text.replace(" ", "T")}+07:00`);
}

export function addCalendarDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Same month arithmetic as SQL DATE_ADD(... INTERVAL n MONTH): the day is clamped to the
// last day of the target month (31 Jan + 1 month = 28/29 Feb), in Bangkok wall-clock time.
export function addMonthsClamped(time: number, months: number) {
  const shift = 7 * 3_600_000;
  const local = new Date(time + shift);
  const targetMonth = local.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const moved = Date.UTC(local.getUTCFullYear(), targetMonth, Math.min(local.getUTCDate(), lastDay), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds());
  return moved - shift;
}

// 12-month plans may pause twice and 6-month plans once, unless the plan says otherwise.
export function pausesAllowedFor(meta: Record<string, unknown>, startsAt: unknown, endsAt: unknown) {
  const explicit = meta.pausesAllowed;
  if (typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 0 && explicit <= 4) return explicit;
  const declared = typeof meta.months === "number" && Number.isInteger(meta.months) && meta.months >= 1 && meta.months <= 36 ? meta.months : undefined;
  const span = (wallClockTime(endsAt) - wallClockTime(startsAt)) / 86_400_000 / 30.4;
  const months = declared ?? (Number.isFinite(span) ? Math.round(span) : 0);
  if (months >= 12) return 2;
  if (months >= 6) return 1;
  return 0;
}

// Bangkok calendar day of a slot relative to now, for "วันนี้ / พรุ่งนี้" labels.
export function playDayKind(playAt: string | null | undefined, now: number): "today" | "tomorrow" | "later" | null {
  const time = playAt ? wallClockTime(playAt) : NaN;
  if (!Number.isFinite(time)) return null;
  const bangkokDay = (value: number) => new Date(value + 7 * 3_600_000).toISOString().slice(0, 10);
  const today = bangkokDay(now);
  const day = bangkokDay(time);
  if (day === today) return "today";
  if (day === addCalendarDays(today, 1)) return "tomorrow";
  return "later";
}

export const PAUSE_DAY_CHOICES = [7, 15, 30, 45, 60];

// Pause lengths offered to the member, capped by the admin's renewal_option maxDays (≤ 60).
export function pauseDayChoices(maxDays: number | undefined) {
  const cap = maxDays && maxDays > 0 ? Math.min(60, maxDays) : 60;
  const choices = PAUSE_DAY_CHOICES.filter((value) => value <= cap);
  return choices.includes(cap) ? choices : [...choices, cap];
}
