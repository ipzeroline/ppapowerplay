import { adminPaymentQueueSql } from "@/lib/admin-payment-list";
import { query } from "@/lib/db";
import { notWalkIn } from "@/lib/walk-in";

// Back-office dashboard figures. Every number is computed in SQL for a stated period (today, this
// month, the last 30 days) and each section is loaded only for staff whose permissions cover it.
//   Sales   = paid payments except wallet top-ups (a top-up is prepaid balance; the purchase made
//             with it is the sale). Cash-in = paid payments not funded from a wallet (money received).

export type DayTotal = { day: string; total: number; count: number };
export type Breakdown = { key: string; total: number; count: number };
export type ScheduleRow = { bookingNo: string; displayName: string; sportName: string; courtName: string | null; startsAt: string; endsAt: string; status: string };
export type QueuePayment = { paymentNo: string; displayName: string; method: string; amount: number; status: string; createdAt?: string | null; paidAt?: string | null; itemName?: string | null; itemType?: string | null; slipUploadedAt?: string | null; previousSlipCount?: number | null; refundStatus?: string | null; cancelReason?: string | null };
export type ExpiringRow = { id: number; displayName: string; memberCode: string; phone: string | null; planName: string; endsAt: string };
export type DashboardSnapshot = {
  generatedAt: string;
  today: string;
  visitsToday: number;
  queue?: { awaiting: number; withSlip: number; oldestSlipMinutes: number | null; refundsDue: number; rows: QueuePayment[] };
  sales?: { today: number; month: number; monthCount: number; previousToDate: number; change: number | null; cashInMonth: number; topupsMonth: number; daily: DayTotal[]; byCategory: Breakdown[]; byChannel: Breakdown[] };
  // Every booking of the day; `schedule` lists only the ones still playing or coming up.
  bookingsToday?: { total: number; checkedIn: number };
  schedule?: ScheduleRow[];
  courts?: { total: number; available: number; maintenance: number };
  members?: { active: number; newToday: number; newMonth: number; withMembership: number; expiring: ExpiringRow[] };
};

type Run = (sql: string) => Promise<unknown[]>;

const notTopup = "COALESCE(JSON_VALUE(metadata, '$.kind'), '') <> 'wallet_topup'";
const monthStart = "DATE_FORMAT(CURDATE(), '%Y-%m-01')";
// Today's live bookings: paid / checked in, or still inside their payment hold (a counter
// "pay later" hold has no expiry: it occupies its court until staff take payment or cancel).
const bookedToday = "b.starts_at >= CURDATE() AND b.starts_at < CURDATE() + INTERVAL 1 DAY AND (b.status IN ('paid', 'checked_in') OR (b.status IN ('hold', 'pending_payment') AND (b.expires_at IS NULL OR b.expires_at > NOW())))";

const sql = {
  today: "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') today",
  visits: "SELECT COUNT(*) total FROM member_visits WHERE created_at >= CURDATE()",
  // The slip wait runs from when the member sent the slip (staff can act from then on).
  queue: "SELECT COUNT(CASE WHEN status = 'created' THEN 1 END) awaiting, COUNT(CASE WHEN status = 'created' AND slip_uploaded_at IS NOT NULL THEN 1 END) withSlip, TIMESTAMPDIFF(MINUTE, MIN(CASE WHEN status = 'created' AND slip_uploaded_at IS NOT NULL THEN slip_uploaded_at END), NOW()) oldestSlipMinutes, COUNT(CASE WHEN status = 'cancelled' AND JSON_VALUE(metadata, '$.refund.status') = 'pending' THEN 1 END) refundsDue FROM payments WHERE status IN ('created', 'cancelled')",
  sales: `SELECT COALESCE(SUM(CASE WHEN paid_at >= CURDATE() AND ${notTopup} THEN amount END), 0) salesToday, COALESCE(SUM(CASE WHEN paid_at >= ${monthStart} AND ${notTopup} THEN amount END), 0) salesMonth, COUNT(CASE WHEN paid_at >= ${monthStart} AND ${notTopup} THEN 1 END) salesMonthCount, COALESCE(SUM(CASE WHEN paid_at < NOW() - INTERVAL 1 MONTH AND ${notTopup} THEN amount END), 0) salesPreviousToDate, COALESCE(SUM(CASE WHEN paid_at >= ${monthStart} AND method <> 'wallet' THEN amount END), 0) cashInMonth, COALESCE(SUM(CASE WHEN paid_at >= ${monthStart} AND NOT (${notTopup}) THEN amount END), 0) topupsMonth FROM payments WHERE status = 'paid' AND paid_at >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')`,
  daily: `SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') day, SUM(amount) total, COUNT(*) count FROM payments WHERE status = 'paid' AND paid_at >= CURDATE() - INTERVAL 29 DAY AND ${notTopup} GROUP BY DATE_FORMAT(paid_at, '%Y-%m-%d') ORDER BY day`,
  category: `SELECT CASE WHEN booking_id IS NOT NULL THEN 'booking' ELSE COALESCE(JSON_VALUE(metadata, '$.itemType'), 'other') END category, SUM(amount) total, COUNT(*) count FROM payments WHERE status = 'paid' AND paid_at >= ${monthStart} AND ${notTopup} GROUP BY category ORDER BY total DESC`,
  channel: `SELECT method, SUM(amount) total, COUNT(*) count FROM payments WHERE status = 'paid' AND paid_at >= ${monthStart} AND method <> 'wallet' GROUP BY method ORDER BY total DESC`,
  courts: "SELECT COUNT(*) total, COUNT(CASE WHEN status = 'available' THEN 1 END) available, COUNT(CASE WHEN status = 'maintenance' THEN 1 END) maintenance FROM courts",
  bookingsToday: `SELECT COUNT(*) total, COUNT(CASE WHEN b.status = 'checked_in' THEN 1 END) checkedIn FROM bookings b WHERE ${bookedToday}`,
  // What is playing now and next: a busy day has more bookings than fit, and finished games are not actionable.
  schedule: `SELECT b.booking_no bookingNo, COALESCE(b.guest_name, u.display_name) displayName, s.name_th sportName, c.name courtName, b.starts_at startsAt, b.ends_at endsAt, b.status FROM bookings b JOIN users u ON u.id = b.user_id JOIN sports s ON s.id = b.sport_id LEFT JOIN courts c ON c.id = b.court_id WHERE ${bookedToday} AND b.ends_at > NOW() ORDER BY b.starts_at, c.name LIMIT 60`,
  members: `SELECT COUNT(*) total, COUNT(CASE WHEN created_at >= CURDATE() THEN 1 END) newToday, COUNT(CASE WHEN created_at >= ${monthStart} THEN 1 END) newMonth FROM users WHERE status = 'active' AND ${notWalkIn("users")}`,
  withMembership: "SELECT COUNT(DISTINCT user_id) total FROM memberships WHERE status = 'active' AND starts_at <= NOW() AND ends_at > NOW()",
  expiring: "SELECT m.id, u.display_name displayName, u.member_code memberCode, u.phone, m.plan_name planName, m.ends_at endsAt FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.status = 'active' AND m.ends_at > NOW() AND m.ends_at <= NOW() + INTERVAL 7 DAY AND NOT EXISTS (SELECT 1 FROM memberships n WHERE n.user_id = m.user_id AND n.status = 'active' AND n.ends_at > m.ends_at) ORDER BY m.ends_at LIMIT 50",
};

const number = (value: unknown) => Number(value ?? 0) || 0;

export function percentChange(current: number, previous: number) {
  return previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}

// One entry per day for the `days` days ending `today` (YYYY-MM-DD, the database's date).
export function fillDays(rows: { day: string; total: unknown; count: unknown }[], today: string, days: number): DayTotal[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const [year, month, day] = today.split("-").map(Number);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - (days - 1 - index))).toISOString().slice(0, 10);
    const row = byDay.get(date);
    return { day: date, total: number(row?.total), count: number(row?.count) };
  });
}

const breakdown = (rows: unknown[], key: string): Breakdown[] => (rows as Record<string, unknown>[]).map((row) => ({ key: String(row[key] ?? "other"), total: number(row.total), count: number(row.count) }));

// Queries run one after another: the dashboard refreshes in the background and should not take
// several pool connections at once from the member app.
export async function loadDashboard(can: (permission: string) => boolean, run: Run = (text) => query(text)): Promise<DashboardSnapshot> {
  const any = (...permissions: string[]) => permissions.some(can);
  const first = async (text: string) => ((await run(text)) as Record<string, unknown>[])[0] ?? {};
  const today = String((await first(sql.today)).today || new Date().toISOString().slice(0, 10));
  const snapshot: DashboardSnapshot = { generatedAt: new Date().toISOString(), today, visitsToday: number((await first(sql.visits)).total) };
  if (any("payments.manage", "reports.view")) {
    const queue = await first(sql.queue);
    snapshot.queue = {
      awaiting: number(queue.awaiting),
      withSlip: number(queue.withSlip),
      oldestSlipMinutes: queue.oldestSlipMinutes === null || queue.oldestSlipMinutes === undefined ? null : number(queue.oldestSlipMinutes),
      refundsDue: number(queue.refundsDue),
      rows: (await run(adminPaymentQueueSql)) as QueuePayment[],
    };
    const totals = await first(sql.sales);
    const month = number(totals.salesMonth);
    const previousToDate = number(totals.salesPreviousToDate);
    snapshot.sales = {
      today: number(totals.salesToday),
      month,
      monthCount: number(totals.salesMonthCount),
      previousToDate,
      change: percentChange(month, previousToDate),
      cashInMonth: number(totals.cashInMonth),
      topupsMonth: number(totals.topupsMonth),
      daily: fillDays((await run(sql.daily)) as { day: string; total: unknown; count: unknown }[], today, 30),
      byCategory: breakdown(await run(sql.category), "category"),
      byChannel: breakdown(await run(sql.channel), "method"),
    };
  }
  if (any("bookings.manage", "reports.view")) {
    const courts = await first(sql.courts);
    snapshot.courts = { total: number(courts.total), available: number(courts.available), maintenance: number(courts.maintenance) };
    const booked = await first(sql.bookingsToday);
    snapshot.bookingsToday = { total: number(booked.total), checkedIn: number(booked.checkedIn) };
    snapshot.schedule = (await run(sql.schedule)) as ScheduleRow[];
  }
  if (any("members.manage", "reports.view")) {
    const members = await first(sql.members);
    snapshot.members = {
      active: number(members.total),
      newToday: number(members.newToday),
      newMonth: number(members.newMonth),
      withMembership: number((await first(sql.withMembership)).total),
      expiring: (await run(sql.expiring)) as ExpiringRow[],
    };
  }
  return snapshot;
}
