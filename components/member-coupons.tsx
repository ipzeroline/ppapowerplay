"use client";
import { formatDate } from "@/components/member-packages";
import type { Coupon } from "@/components/member-types";
import { localeTag, t } from "@/lib/i18n";
import { daysLeft, remainingPercent, usedCount, wallClockTime } from "@/lib/package-presentation";

function purchaseLabel(value: string | undefined) {
  const time = wallClockTime(value);
  if (!value || !Number.isFinite(time)) return "";
  const date = new Date(time).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  const clock = new Date(time).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  return t("ซื้อเมื่อ {{value0}} · {{value1}} น.", { value0: date, value1: clock });
}

function CouponCard({ coupon, now, expired = false, onOpen, onRenew }: { coupon: Coupon; now: number; expired?: boolean; onOpen?: () => void; onRenew?: () => void }) {
  const remaining = Number(coupon.remainingUses || 0);
  const total = Math.max(Number(coupon.totalUses || 0), remaining);
  const body = (
    <>
      <span className="cp-card-head">
        <b>{t(coupon.name)}</b>
        <span className="cp-left">{t("เหลือ {{value0}}", { value0: remaining })}</span>
      </span>
      {coupon.purchasedAt ? <span className="cp-meta">{purchaseLabel(coupon.purchasedAt)}</span> : null}
      <span className="cp-stats">
        <span><small>{t("ทั้งหมด")}</small><b>{total}</b></span>
        <span><small>{t("ใช้ไป")}</small><b className="used">{usedCount(total, remaining)}</b></span>
        <span><small>{t("คงเหลือ")}</small><b className="left">{remaining}</b></span>
      </span>
      <span className="cp-exp">
        {expired
          ? t("หมดอายุแล้วเมื่อ {{value0}}", { value0: formatDate(coupon.expiresAt) })
          : <>{t("หมดอายุ {{value0}} · ใช้ได้อีก", { value0: formatDate(coupon.expiresAt) })} <b>{t("{{value0}} วัน", { value0: daysLeft(coupon.expiresAt, now) })}</b></>}
      </span>
      <span className="cp-bar" aria-hidden="true"><i style={{ width: `${remainingPercent(remaining, total)}%` }} /></span>
    </>
  );
  return (
    <article className={expired ? "cp-card expired" : "cp-card"}>
      {onOpen
        ? <button type="button" className="cp-card-body" onClick={onOpen} aria-label={t("เปิด QR ใช้ {{value0}}", { value0: t(coupon.name) })}>{body}</button>
        : <div className="cp-card-body">{body}</div>}
      {onRenew ? <button type="button" className="cp-renew" onClick={onRenew}>{t("ต่ออายุคูปองนี้")}</button> : null}
    </article>
  );
}

// แก้ 3: each coupon shows quantity, purchase date, remaining uses and expiry.
export function MyCouponList({ coupons, expiredCoupons, now, onOpenQr, onRenew, onBuy }: {
  coupons: Coupon[];
  expiredCoupons: Coupon[];
  now: number;
  onOpenQr: (coupon: Coupon) => void;
  onRenew: (coupon: Coupon) => void;
  onBuy: () => void;
}) {
  if (!coupons.length && !expiredCoupons.length) {
    return <div className="club-empty"><strong>{t("ยังไม่มีคูปอง")}</strong><button type="button" onClick={onBuy}>{t("ซื้อคูปอง")}</button></div>;
  }
  return (
    <>
      {coupons.length ? <p className="cp-hint">{t("แตะคูปองเพื่อเปิด QR ให้เจ้าหน้าที่สแกน")}</p> : null}
      <div className="cp-list">
        {coupons.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} now={now} onOpen={() => onOpenQr(coupon)} />)}
      </div>
      {expiredCoupons.length ? (
        <>
          <div className="reward-label">{t("หมดอายุแล้ว (ต่ออายุได้ภายใน 30 วัน)")}</div>
          <div className="cp-list">
            {expiredCoupons.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} now={now} expired onRenew={() => onRenew(coupon)} />)}
          </div>
        </>
      ) : null}
      <button type="button" className="ghost cp-buy" onClick={onBuy}>{t("🎫 ซื้อคูปองเพิ่ม")}</button>
    </>
  );
}
