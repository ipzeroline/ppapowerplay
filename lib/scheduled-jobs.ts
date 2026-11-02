import type mysql from "mysql2/promise";
import { pool } from "@/lib/db";
import { notifyMember, pushLineMessage, pushText } from "@/lib/notify";
import { notWalkIn } from "@/lib/walk-in";

// Work that runs on a schedule (POST /api/cron/run with CRON_SECRET) and, for the payment queue,
// also whenever staff open AdminConsole (runStalePaymentSweep):
//   cancelStalePayments: payment requests nobody paid are cancelled (3 days, or once the booked
//     session has ended), so the queue only holds what staff can act on. A request with a slip
//     always waits for staff; counter "pay later" holds have no payment request and stay.
//   sendReminders: a paid court booking starting within 2 hours, a package ending within 3 days.
//     member_reminders records each one, so a job running every few minutes never repeats it.

type Connection = Pick<mysql.PoolConnection, "execute">;
export type JobNotice = { userId: number; title: string; body: string };
type StaleRow = { id: number; paymentNo: string; userId: number; bookingId: number | null; amount: number | string; metadataText: string | null; itemName: string | null };

const staleSql = "SELECT p.id, p.payment_no paymentNo, p.user_id userId, p.booking_id bookingId, p.amount, CAST(p.metadata AS CHAR) metadataText, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.metadata, '$.itemName')), b.title) itemName FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id WHERE p.status = 'created' AND p.slip_uploaded_at IS NULL AND ((p.booking_id IS NULL AND p.created_at < NOW() - INTERVAL 3 DAY) OR (p.booking_id IS NOT NULL AND b.ends_at < NOW())) ORDER BY p.id LIMIT 200 FOR UPDATE";
const soonSql = `SELECT b.id, b.user_id userId, b.title, DATE_FORMAT(b.starts_at, '%H:%i') startTime FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.status = 'paid' AND b.starts_at > NOW() AND b.starts_at <= NOW() + INTERVAL 2 HOUR AND b.guest_name IS NULL AND ${notWalkIn("u")} AND u.status = 'active' ORDER BY b.starts_at LIMIT 500`;
const endingSql = "SELECT m.id, m.user_id userId, m.plan_name planName, DATE_FORMAT(m.ends_at, '%Y-%m-%d') endsOn FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.status = 'active' AND m.ends_at > NOW() AND m.ends_at <= NOW() + INTERVAL 3 DAY AND u.status = 'active' AND NOT EXISTS (SELECT 1 FROM memberships n WHERE n.user_id = m.user_id AND n.status = 'active' AND n.ends_at > m.ends_at) ORDER BY m.ends_at LIMIT 500";

function parseMetadata(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

const baht = (value: number | string) => Number(value || 0).toLocaleString("th-TH");
const thaiDate = (date: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export async function cancelStalePayments(conn: Connection): Promise<JobNotice[]> {
  const [rows] = await conn.execute(staleSql);
  const notices: JobNotice[] = [];
  for (const row of rows as StaleRow[]) {
    const metadata = parseMetadata(row.metadataText);
    metadata.cancelReason = "ไม่ได้ชำระภายในเวลาที่กำหนด";
    metadata.autoCancelled = true;
    await conn.execute("UPDATE payments SET status = 'cancelled', metadata = ? WHERE id = ? AND status = 'created'", [JSON.stringify(metadata), row.id]);
    if (row.bookingId) await conn.execute("UPDATE bookings SET status = 'expired' WHERE id = ? AND status IN ('hold','pending_payment')", [row.bookingId]);
    const notice = { userId: Number(row.userId), title: "รายการชำระหมดเวลา", body: `${row.itemName || "รายการชำระเงิน"} · ${baht(row.amount)} ฿ ยกเลิกอัตโนมัติเพราะไม่ได้ชำระภายในเวลาที่กำหนด ไม่มีการเรียกเก็บเงิน ทำรายการใหม่ได้ในแอป` };
    await notifyMember(conn, notice.userId, notice.title, notice.body);
    await conn.execute(
      "INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (NULL, 'payment.auto_cancel', 'payment', ?, ?)",
      [row.paymentNo, JSON.stringify({ bookingId: row.bookingId, amount: Number(row.amount) })],
    );
    notices.push(notice);
  }
  return notices;
}

// True only for the run that recorded the reminder (INSERT IGNORE: 1 row, or 0 when already sent).
async function firstTime(conn: Connection, kind: "booking_soon" | "membership_ending", refId: number, userId: number) {
  const [result] = await conn.execute("INSERT IGNORE INTO member_reminders (kind, ref_id, user_id) VALUES (?, ?, ?)", [kind, refId, userId]);
  return Number((result as { affectedRows?: number }).affectedRows) === 1;
}

export async function sendReminders(conn: Connection): Promise<JobNotice[]> {
  const notices: JobNotice[] = [];
  const [soon] = await conn.execute(soonSql);
  for (const booking of soon as { id: number; userId: number; title: string; startTime: string }[]) {
    if (!(await firstTime(conn, "booking_soon", booking.id, booking.userId))) continue;
    const notice = { userId: Number(booking.userId), title: "ใกล้ถึงเวลาจองสนาม", body: `${booking.title} เริ่ม ${booking.startTime} น. วันนี้ · เช็คอินด้วย QR ในแอปที่เคาน์เตอร์` };
    await notifyMember(conn, notice.userId, notice.title, notice.body);
    notices.push(notice);
  }
  const [ending] = await conn.execute(endingSql);
  for (const membership of ending as { id: number; userId: number; planName: string; endsOn: string }[]) {
    if (!(await firstTime(conn, "membership_ending", membership.id, membership.userId))) continue;
    const notice = { userId: Number(membership.userId), title: "แพ็กเกจใกล้หมดอายุ", body: `${membership.planName} หมดอายุ ${thaiDate(membership.endsOn)} · ต่ออายุได้ในแอป` };
    await notifyMember(conn, notice.userId, notice.title, notice.body);
    notices.push(notice);
  }
  return notices;
}

// One job in its own transaction on its own connection.
export async function runJob(job: (conn: Connection) => Promise<JobNotice[]>) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const notices = await job(conn);
    await conn.commit();
    return notices;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

// Keeps the payment queue clean even where no cron is set up: AdminConsole runs this after its
// response, at most once every 10 minutes per server process. Failures are logged, never shown.
let lastSweep = 0;
export async function runStalePaymentSweep() {
  if (Date.now() - lastSweep < 10 * 60_000) return;
  lastSweep = Date.now();
  try {
    const notices = await runJob(cancelStalePayments);
    for (const notice of notices) void pushLineMessage(notice.userId, pushText(notice.title, notice.body));
  } catch (error) {
    console.error("Stale payment sweep failed", error);
  }
}
