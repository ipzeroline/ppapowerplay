import { nextDay } from "@/lib/court-blocks";
import { query } from "@/lib/db";

// Daily cash-up (Reports → ปิดยอดประจำวัน): the money taken on one Bangkok day, by channel and by
// the staff member who took it, so the counter can count the drawer and sign the sheet.
//   Cash-in = paid payments not funded from app credit (method <> 'wallet'): money received that day.
//   Staff   = metadata.soldBy (counter sale or counter booking) or metadata.confirmedBy (staff confirmed
//             an app payment). Older payments without either stay unattributed.
//   Refunds = cancelled transfers refunded that day; metadata.refund.at is a UTC ISO time.

export type Cashup = {
  date: string;
  cashIn: { method: string; amount: number; count: number }[];
  cashInTotal: number;
  walletFunded: { amount: number; count: number };
  byStaff: { staffId: number | null; staffName: string | null; method: string; amount: number; count: number }[];
  refunds: { paymentNo: string; amount: number; refundedAt: string; staffName: string | null; note: string | null }[];
  refundTotal: number;
  rows: { paidAt: string; paymentNo: string; itemName: string | null; customer: string; method: string; amount: number; staffName: string | null }[];
};
type Run = (sql: string, params: unknown[]) => Promise<unknown[]>;
type Row = Record<string, unknown>;

const staffOf = "COALESCE(JSON_VALUE(p.metadata, '$.soldBy'), JSON_VALUE(p.metadata, '$.confirmedBy'))";
const paidOnDay = "p.status = 'paid' AND p.paid_at >= ? AND p.paid_at < ?";

const sql = {
  cashIn: "SELECT method, SUM(amount) amount, COUNT(*) count FROM payments WHERE status = 'paid' AND paid_at >= ? AND paid_at < ? AND method <> 'wallet' GROUP BY method ORDER BY SUM(amount) DESC",
  wallet: "SELECT COALESCE(SUM(amount), 0) amount, COUNT(*) count FROM payments WHERE status = 'paid' AND paid_at >= ? AND paid_at < ? AND method = 'wallet'",
  byStaff: `SELECT ${staffOf} staffId, s.display_name staffName, p.method, SUM(p.amount) amount, COUNT(*) count FROM payments p LEFT JOIN admin_staff s ON s.id = ${staffOf} WHERE ${paidOnDay} AND p.method <> 'wallet' GROUP BY staffId, s.display_name, p.method ORDER BY s.display_name IS NULL, s.display_name, p.method`,
  refunds: "SELECT p.payment_no paymentNo, p.amount, JSON_VALUE(p.metadata, '$.refund.at') refundedAt, s.display_name staffName, JSON_VALUE(p.metadata, '$.refund.note') note FROM payments p LEFT JOIN admin_staff s ON s.id = JSON_VALUE(p.metadata, '$.refund.by') WHERE p.status = 'refunded' AND JSON_VALUE(p.metadata, '$.refund.status') = 'done' AND JSON_VALUE(p.metadata, '$.refund.at') >= ? AND JSON_VALUE(p.metadata, '$.refund.at') < ? ORDER BY refundedAt",
  rows: `SELECT DATE_FORMAT(p.paid_at, '%Y-%m-%d %H:%i:%s') paidAt, p.payment_no paymentNo, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.metadata, '$.itemName')), b.title) itemName, COALESCE(JSON_VALUE(p.metadata, '$.guestName'), u.display_name) customer, p.method, p.amount, s.display_name staffName FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN bookings b ON b.id = p.booking_id LEFT JOIN admin_staff s ON s.id = ${staffOf} WHERE ${paidOnDay} ORDER BY p.paid_at, p.id LIMIT 500`,
};

const number = (value: unknown) => Number(value ?? 0) || 0;
const text = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100;

// Queries run one after another (one pool connection at a time, like the dashboard).
export async function loadCashup(date: string, run: Run = (text, params) => query(text, params)): Promise<Cashup> {
  const day = [`${date} 00:00:00`, `${nextDay(date)} 00:00:00`];
  const refundDay = [new Date(`${date}T00:00:00+07:00`).toISOString(), new Date(`${nextDay(date)}T00:00:00+07:00`).toISOString()];
  const cashIn = ((await run(sql.cashIn, day)) as Row[]).map((row) => ({ method: String(row.method), amount: number(row.amount), count: number(row.count) }));
  const wallet = ((await run(sql.wallet, day)) as Row[])[0] ?? {};
  const byStaff = ((await run(sql.byStaff, day)) as Row[]).map((row) => ({
    staffId: row.staffId === null || row.staffId === undefined || !Number(row.staffId) ? null : Number(row.staffId),
    staffName: text(row.staffName),
    method: String(row.method),
    amount: number(row.amount),
    count: number(row.count),
  }));
  const refunds = ((await run(sql.refunds, refundDay)) as Row[]).map((row) => ({ paymentNo: String(row.paymentNo), amount: number(row.amount), refundedAt: String(row.refundedAt), staffName: text(row.staffName), note: text(row.note) }));
  const rows = ((await run(sql.rows, day)) as Row[]).map((row) => ({ paidAt: String(row.paidAt), paymentNo: String(row.paymentNo), itemName: text(row.itemName), customer: String(row.customer ?? ""), method: String(row.method), amount: number(row.amount), staffName: text(row.staffName) }));
  return {
    date,
    cashIn,
    cashInTotal: sum(cashIn),
    walletFunded: { amount: number(wallet.amount), count: number(wallet.count) },
    byStaff,
    refunds,
    refundTotal: sum(refunds),
    rows,
  };
}
