// Which period a report number covers, and how much of the history a report list holds.
// Client-safe (no server imports): used by the Reports cards and lists in AdminConsole.

export type ReportPeriod = { from: string; to: string };
type Lang = "th" | "en";

// "month": month to date, from the 1st to today (Bangkok); "now": current state; "all": all time.
export function periodLabel(kind: "month" | "now" | "all", period: ReportPeriod | undefined, lang: Lang) {
  if (kind === "now") return lang === "th" ? "ตอนนี้" : "Now";
  if (kind === "all") return lang === "th" ? "ทั้งหมด" : "All time";
  if (!period) return lang === "th" ? "เดือนนี้" : "This month";
  const from = new Date(`${period.from}T00:00:00Z`);
  const to = new Date(`${period.to}T00:00:00Z`);
  const month = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { month: "short", timeZone: "UTC" }).format(to);
  const days = from.getUTCDate() === to.getUTCDate() ? `${to.getUTCDate()}` : `${from.getUTCDate()}–${to.getUTCDate()}`;
  return lang === "th" ? `เดือนนี้ ${days} ${month}` : `This month, ${days} ${month}`;
}

// Report lists hold the latest rows only (200 payments, 200 bookings, ...): say so, with the oldest date.
export function coverageLabel(count: number, oldest: string | Date | null | undefined, lang: Lang) {
  const time = oldest ? new Date(oldest).getTime() : Number.NaN;
  const date = Number.isFinite(time) ? new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(time)) : null;
  if (lang === "th") return date ? `ข้อมูล ${count} รายการล่าสุด ตั้งแต่ ${date}` : `ข้อมูล ${count} รายการล่าสุด`;
  return date ? `Latest ${count} records, since ${date}` : `Latest ${count} records`;
}
