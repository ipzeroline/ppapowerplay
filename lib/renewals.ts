import type mysql from "mysql2/promise";
import { query } from "@/lib/db";
import { bangkokToday } from "@/lib/court-availability";
import { addCalendarDays, parseMeta, pausesAllowedFor } from "@/lib/package-presentation";

export { pausesAllowedFor };

// Package pause: at most 60 days per pause, requested up to 30 days ahead.
export const PAUSE_MAX_DAYS = 60;
export const PAUSE_MAX_LEAD_DAYS = 30;
// Coupons may be renewed until 30 days after they expired, while uses remain.
export const COUPON_RENEW_GRACE_DAYS = 30;

// A membership gives member QR access only outside an active pause window.
export const MEMBERSHIP_NOT_PAUSED = "NOT EXISTS (SELECT 1 FROM membership_pauses mp WHERE mp.membership_id = memberships.id AND mp.status = 'active' AND mp.starts_at <= NOW() AND mp.ends_at > NOW())";

type Connection = Pick<mysql.PoolConnection, "execute">;
export type RenewalKind = "membership_pause" | "coupon_renewal";

export class RenewalError extends Error {
  status: 404 | 409;
  constructor(message: string, status: 404 | 409 = 409) {
    super(message);
    this.status = status;
  }
}

function integerIn(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function renewalOption(kind: RenewalKind) {
  const rows = await query<{ id: number; title: string; price: number; metadata: string | null }>(
    "SELECT id, title, price, CAST(metadata AS CHAR) metadata FROM app_content_items WHERE content_type = 'renewal_option' AND active = TRUE AND price > 0 ORDER BY sort_order, id",
  );
  const item = rows.find((row) => parseMeta(row.metadata).kind === kind);
  if (!item) return null;
  const meta = parseMeta(item.metadata);
  return {
    contentId: Number(item.id),
    title: item.title,
    price: Number(item.price),
    months: integerIn(meta.months, 1, 12) ?? 1,
    maxDays: Math.min(PAUSE_MAX_DAYS, integerIn(meta.maxDays, 1, PAUSE_MAX_DAYS) ?? PAUSE_MAX_DAYS),
  };
}

type PauseInput = { userId: number; membershipId: number; startDate: string; days: number; today?: string; maxDays?: number };

// Validates a pause against the locked membership row. `enforceLeadTime` is relaxed when
// staff approve a PromptPay request after its requested start date has already passed.
export async function checkPauseRequest(conn: Connection, input: PauseInput, options: { enforceLeadTime?: boolean } = {}) {
  const maxDays = Math.min(PAUSE_MAX_DAYS, input.maxDays ?? PAUSE_MAX_DAYS);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > maxDays) throw new RenewalError("จำนวนวันพักเกินกว่าที่กำหนด");
  if (!isCalendarDate(input.startDate)) throw new RenewalError("วันเริ่มพักไม่ถูกต้อง");
  const today = input.today || bangkokToday();
  if ((options.enforceLeadTime ?? true) && (input.startDate < today || input.startDate > addCalendarDays(today, PAUSE_MAX_LEAD_DAYS))) {
    throw new RenewalError("เลือกวันเริ่มพักได้ตั้งแต่วันนี้ถึง 30 วันข้างหน้า");
  }
  const startsAt = `${input.startDate} 00:00:00`;
  const endsAt = `${addCalendarDays(input.startDate, input.days)} 00:00:00`;

  const [rows] = await conn.execute(
    "SELECT id, starts_at startsAt, ends_at endsAt, status, CAST(metadata AS CHAR) metadata, ends_at > NOW() AS isCurrent, ? < ends_at AS startsBeforeEnd FROM memberships WHERE id = ? AND user_id = ? FOR UPDATE",
    [startsAt, input.membershipId, input.userId],
  );
  const membership = (rows as { startsAt: unknown; endsAt: unknown; status: string; metadata: string | null; isCurrent: number; startsBeforeEnd: number }[])[0];
  if (!membership) throw new RenewalError("ไม่พบแพ็กเกจที่ต้องการพัก", 404);
  if (membership.status !== "active" || !Number(membership.isCurrent)) throw new RenewalError("แพ็กเกจนี้ไม่ได้ใช้งานอยู่");
  if (!Number(membership.startsBeforeEnd)) throw new RenewalError("วันเริ่มพักต้องอยู่ก่อนวันหมดอายุแพ็กเกจ");

  const allowed = pausesAllowedFor(parseMeta(membership.metadata), membership.startsAt, membership.endsAt);
  if (!allowed) throw new RenewalError("แพ็กเกจนี้ไม่รองรับการพักการใช้งาน");
  const [pauseRows] = await conn.execute(
    "SELECT id, (? < ends_at AND ? > starts_at) AS isOverlap FROM membership_pauses WHERE membership_id = ? AND status = 'active'",
    [startsAt, endsAt, input.membershipId],
  );
  const pauses = pauseRows as { isOverlap: number }[];
  if (pauses.length >= allowed) throw new RenewalError("แพ็กเกจนี้ใช้สิทธิ์พักการใช้งานครบแล้ว");
  if (pauses.some((pause) => Number(pause.isOverlap))) throw new RenewalError("ช่วงวันที่ซ้อนกับการพักที่มีอยู่แล้ว");
  return { startsAt, endsAt };
}

export async function applyMembershipPause(conn: Connection, input: PauseInput & { paymentId: number | null; enforceLeadTime?: boolean }) {
  const window = await checkPauseRequest(conn, input, { enforceLeadTime: input.enforceLeadTime });
  await conn.execute(
    "INSERT INTO membership_pauses (membership_id, user_id, payment_id, starts_at, ends_at, days, status) VALUES (?, ?, ?, ?, ?, ?, 'active')",
    [input.membershipId, input.userId, input.paymentId, window.startsAt, window.endsAt, input.days],
  );
  // Remaining days continue after the pause: extend the end by the paused days.
  await conn.execute("UPDATE memberships SET ends_at = DATE_ADD(ends_at, INTERVAL ? DAY) WHERE id = ? AND user_id = ?", [input.days, input.membershipId, input.userId]);
  return window;
}

export async function checkCouponRenewal(conn: Connection, input: { userId: number; userCouponId: number }) {
  const [rows] = await conn.execute(
    `SELECT uc.id, c.name, uc.remaining_uses remainingUses, uc.status, uc.expires_at > NOW() - INTERVAL ${COUPON_RENEW_GRACE_DAYS} DAY AS renewable FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.id = ? AND uc.user_id = ? FOR UPDATE`,
    [input.userCouponId, input.userId],
  );
  const coupon = (rows as { name: string; remainingUses: number; status: string; renewable: number }[])[0];
  if (!coupon) throw new RenewalError("ไม่พบคูปองที่ต้องการต่ออายุ", 404);
  if (coupon.status !== "active" || Number(coupon.remainingUses) <= 0) throw new RenewalError("คูปองนี้ใช้ครบแล้ว ต่ออายุไม่ได้");
  if (!Number(coupon.renewable)) throw new RenewalError("คูปองหมดอายุเกิน 30 วันแล้ว ต่ออายุไม่ได้");
  return { name: coupon.name };
}

export async function applyCouponRenewal(conn: Connection, input: { userId: number; userCouponId: number; months: number }) {
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 12) throw new RenewalError("จำนวนเดือนต่ออายุไม่ถูกต้อง");
  const coupon = await checkCouponRenewal(conn, input);
  // Remaining uses stay the same; expiry moves on from today if already expired.
  await conn.execute(
    "UPDATE user_coupons SET expires_at = DATE_ADD(GREATEST(expires_at, NOW()), INTERVAL ? MONTH) WHERE id = ? AND user_id = ?",
    [input.months, input.userCouponId, input.userId],
  );
  return coupon;
}

const pendingRefKeys = { membershipId: "$.membershipId", userCouponId: "$.userCouponId" } as const;

// One waiting (PromptPay) request per membership or coupon until it is approved or cancelled
// (members cancel unpaid requests themselves; staff cancel in AdminConsole). Callers lock the
// target row first, so concurrent requests for the same target serialize on that lock.
export async function assertNoPendingRequest(conn: Connection, input: { userId: number; itemType: RenewalKind; refKey: keyof typeof pendingRefKeys; refId: number }) {
  const [rows] = await conn.execute(
    `SELECT id FROM payments WHERE user_id = ? AND status = 'created' AND JSON_VALUE(metadata, '$.itemType') = ? AND JSON_VALUE(metadata, '${pendingRefKeys[input.refKey]}') = ? LIMIT 1`,
    [input.userId, input.itemType, String(input.refId)],
  );
  if ((rows as unknown[]).length) throw new RenewalError("มีคำขอนี้รอยืนยันการชำระเงินอยู่แล้ว");
}
