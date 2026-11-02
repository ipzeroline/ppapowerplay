import { query } from "@/lib/db";
import type { ReportPeriod } from "@/lib/report-periods";
import { notWalkIn } from "@/lib/walk-in";

// Reports cards: counted in SQL for a stated period (month to date, now, or all time) instead of
// from the capped lists the page loads. Each section is loaded only for staff allowed to see its
// list, with the same permissions as those lists.
//   Sales = paid payments except wallet top-ups, as on the dashboard.

export type ReportFigures = {
  period: ReportPeriod;
  finance?: { salesMonth: number; paymentsMonth: number; avgBookingValueMonth: number | null };
  bookings?: { month: number; paidMonth: number; pendingNow: number; cancelledMonth: number; checkedInMonth: number; paidRate: number | null };
  members?: { total: number; active: number; newMonth: number; checkinsMonth: number };
  courts?: { total: number; available: number; maintenance: number };
  coupons?: { total: number; active: number; soldMonth: number };
  trainers?: { total: number; active: number; avgPrice: number | null };
  audit?: { eventsMonth: number; sensitiveMonth: number };
};
type Run = (sql: string) => Promise<unknown[]>;

const monthStart = "DATE_FORMAT(CURDATE(), '%Y-%m-01')";
const notTopup = "COALESCE(JSON_VALUE(metadata, '$.kind'), '') <> 'wallet_topup'";

const sql = {
  period: `SELECT ${monthStart} monthStart, DATE_FORMAT(CURDATE(), '%Y-%m-%d') today`,
  finance: `SELECT COALESCE(SUM(amount), 0) salesMonth, COUNT(*) paymentsMonth, AVG(CASE WHEN booking_id IS NOT NULL THEN amount END) avgBookingValueMonth FROM payments WHERE status = 'paid' AND paid_at >= ${monthStart} AND ${notTopup}`,
  // Bookings made this month (any session date), and what is held right now.
  bookings: `SELECT COUNT(*) month, COUNT(CASE WHEN status IN ('paid', 'checked_in') THEN 1 END) paidMonth, COUNT(CASE WHEN status IN ('cancelled', 'expired') THEN 1 END) cancelledMonth, COUNT(CASE WHEN status = 'checked_in' THEN 1 END) checkedInMonth, (SELECT COUNT(*) FROM bookings WHERE status IN ('hold', 'pending_payment') AND (expires_at IS NULL OR expires_at > NOW())) pendingNow FROM bookings WHERE created_at >= ${monthStart}`,
  members: `SELECT COUNT(*) total, COUNT(CASE WHEN status = 'active' THEN 1 END) active, COUNT(CASE WHEN created_at >= ${monthStart} THEN 1 END) newMonth, (SELECT COUNT(*) FROM member_visits WHERE created_at >= ${monthStart}) checkinsMonth FROM users WHERE ${notWalkIn("users")}`,
  courts: "SELECT COUNT(*) total, COUNT(CASE WHEN status = 'available' THEN 1 END) available, COUNT(CASE WHEN status = 'maintenance' THEN 1 END) maintenance FROM courts",
  coupons: `SELECT COUNT(*) total, COUNT(CASE WHEN active = TRUE THEN 1 END) active, (SELECT COUNT(*) FROM user_coupons WHERE created_at >= ${monthStart}) soldMonth FROM coupons`,
  trainers: "SELECT COUNT(*) total, COUNT(CASE WHEN active = TRUE THEN 1 END) active, AVG(CASE WHEN active = TRUE THEN start_price END) avgPrice FROM trainers",
  audit: `SELECT COUNT(*) eventsMonth, COUNT(CASE WHEN action LIKE '%delete%' OR action LIKE '%password%' THEN 1 END) sensitiveMonth FROM admin_audit_logs WHERE created_at >= ${monthStart}`,
};

const number = (value: unknown) => Number(value ?? 0) || 0;
const average = (value: unknown) => (value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100);

// One query at a time, like the dashboard: the console should not take several pool connections at once.
export async function loadReportFigures(can: (permission: string) => boolean, run: Run = (text) => query(text)): Promise<ReportFigures> {
  const any = (...permissions: string[]) => permissions.some(can);
  const first = async (text: string) => ((await run(text)) as Record<string, unknown>[])[0] ?? {};
  const period = await first(sql.period);
  const figures: ReportFigures = { period: { from: String(period.monthStart || ""), to: String(period.today || "") } };
  if (any("payments.manage", "reports.view")) {
    const row = await first(sql.finance);
    figures.finance = { salesMonth: number(row.salesMonth), paymentsMonth: number(row.paymentsMonth), avgBookingValueMonth: average(row.avgBookingValueMonth) };
  }
  if (any("bookings.manage", "reports.view")) {
    const row = await first(sql.bookings);
    const month = number(row.month);
    const paidMonth = number(row.paidMonth);
    figures.bookings = { month, paidMonth, pendingNow: number(row.pendingNow), cancelledMonth: number(row.cancelledMonth), checkedInMonth: number(row.checkedInMonth), paidRate: month ? Math.round((paidMonth / month) * 100) : null };
  }
  if (any("members.manage", "reports.view")) {
    const row = await first(sql.members);
    figures.members = { total: number(row.total), active: number(row.active), newMonth: number(row.newMonth), checkinsMonth: number(row.checkinsMonth) };
  }
  if (any("bookings.manage", "reports.view")) {
    const row = await first(sql.courts);
    figures.courts = { total: number(row.total), available: number(row.available), maintenance: number(row.maintenance) };
  }
  if (any("coupons.manage", "reports.view")) {
    const row = await first(sql.coupons);
    figures.coupons = { total: number(row.total), active: number(row.active), soldMonth: number(row.soldMonth) };
  }
  if (any("trainers.manage", "reports.view")) {
    const row = await first(sql.trainers);
    figures.trainers = { total: number(row.total), active: number(row.active), avgPrice: average(row.avgPrice) };
  }
  if (any("settings.manage")) {
    const row = await first(sql.audit);
    figures.audit = { eventsMonth: number(row.eventsMonth), sensitiveMonth: number(row.sensitiveMonth) };
  }
  return figures;
}
