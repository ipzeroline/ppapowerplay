"use client";
import { useId, useState } from "react";
import { Empty, money, Top } from "@/components/member-ui";
import type { Bootstrap, ContentItem, Coupon, Membership } from "@/components/member-types";
import { bangkokToday } from "@/lib/court-availability";
import { localeTag, t } from "@/lib/i18n";
import { addCalendarDays, addMonthsClamped, groupPackages, parseMeta, pauseDayChoices, pausesAllowedFor, perUnit, validityLabel, wallClockTime, type PackageGroup } from "@/lib/package-presentation";

export type PlanTab = "monthly" | "time" | "coupon" | "renew";
export type RenewTab = "package" | "coupon";
type PlansData = Pick<Bootstrap, "coupons" | "expiredCoupons" | "memberships" | "membershipPauses" | "pendingPayments">;


const PAUSE_LEAD_DAYS = 30;

const planTabs: [PlanTab, string][] = [["monthly", "plans.tab.monthly"], ["time", "plans.tab.time"], ["coupon", "plans.tab.coupon"], ["renew", "plans.tab.renew"]];

export function formatDate(value: string | null | undefined, withTime = false) {
  const time = wallClockTime(value);
  if (!Number.isFinite(time)) return "-";
  return new Date(time).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

export function validityText(days: number | undefined) {
  const { amount, unit } = validityLabel(Number(days || 0));
  if (unit === "year") return t("{{value0}} ปี", { value0: amount });
  if (unit === "month") return t("{{value0}} เดือน", { value0: amount });
  return t("{{value0}} วัน", { value0: amount });
}

function labelOf(item: { title?: string; name?: string; metadata?: unknown }) {
  const label = parseMeta(item.metadata).label;
  return typeof label === "string" && label.trim() ? label : item.title || item.name || "";
}

function numberMeta(item: { metadata?: unknown }, key: string) {
  const value = parseMeta(item.metadata)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type ExtraRow = { key: string | number; label: string; sub?: string; price: number; onClick: () => void };

// "Extra" variants (Fitness + Swim / Fitness + Hyrox) collapse under their base option.
function ExtraPanel({ label, rows, standalone = false }: { label: string; rows: ExtraRow[]; standalone?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <button type="button" className={`extra-toggle${standalone ? " standalone" : ""}${open ? " open" : ""}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {open ? t("plans.extra.hide") : label} <span aria-hidden="true">▾</span>
      </button>
      <div className="extra-panel" id={panelId} hidden={!open}>
        {rows.map((row) => (
          <button type="button" className="extra-row" key={row.key} onClick={row.onClick}>
            <span>{row.label}{row.sub ? <small>{row.sub}</small> : null}</span>
            <strong>{money(row.price)} ฿</strong>
          </button>
        ))}
      </div>
    </>
  );
}

function FeaturedPlan({ group, onSelect }: { group: PackageGroup<ContentItem>; onSelect: (item: ContentItem) => void }) {
  const base = group.base;
  const meta = parseMeta(base.metadata);
  const months = numberMeta(base, "months");
  const perks = Array.isArray(meta.perks) ? meta.perks.filter((perk): perk is string => typeof perk === "string") : [];
  return (
    <div className="pkg-block featured">
      <article className="plan-card">
        <div className="plan-card-head">
          <strong>{t(labelOf(base))}</strong>
          {typeof meta.badge === "string" ? <span className="plan-badge">{t(meta.badge)}</span> : null}
        </div>
        <div className="plan-card-price">
          {money(base.price)} ฿ {months > 1 ? <small>{t("(เฉลี่ย {{value0}} ฿ / เดือน)", { value0: money(perUnit(base.price, months)) })}</small> : null}
        </div>
        {perks.length ? <ul>{perks.map((perk) => <li key={perk}>{t(perk)}</li>)}</ul> : null}
        <button type="button" className="plan-card-cta" onClick={() => onSelect(base)}>{t(base.actionLabel || "เลือกแพ็กเกจนี้")}</button>
      </article>
      {group.extras.length ? (
        <ExtraPanel standalone label={months ? t("Extra · {{value0}} เดือน", { value0: months }) : "Extra"} rows={group.extras.map((extra) => extraRow("monthly", base, extra, onSelect))} />
      ) : null}
    </div>
  );
}

function extraRow(kind: "monthly" | "time", base: ContentItem, extra: ContentItem, onSelect: (item: ContentItem) => void): ExtraRow {
  const difference = Number(extra.price) - Number(base.price);
  const sub = kind === "monthly" && difference > 0 ? `${money(base.price)} + ${money(difference)} ฿` : undefined;
  return { key: extra.id, label: t(labelOf(extra)), sub, price: Number(extra.price), onClick: () => onSelect(extra) };
}

function packageSubtitle(item: ContentItem, kind: "monthly" | "time") {
  if (item.subtitle) return t(item.subtitle);
  const months = numberMeta(item, "months");
  const days = numberMeta(item, "days");
  if (kind === "monthly" && months > 1) return t("เฉลี่ย {{value0}} ฿/เดือน", { value0: money(perUnit(item.price, months)) });
  if (kind === "time" && days > 1) return t("เฉลี่ย {{value0}} ฿/ครั้ง", { value0: money(perUnit(item.price, days)) });
  return "";
}

function PackageBlock({ group, kind, onSelect }: { group: PackageGroup<ContentItem>; kind: "monthly" | "time"; onSelect: (item: ContentItem) => void }) {
  const base = group.base;
  const sub = packageSubtitle(base, kind);
  return (
    <div className="pkg-block">
      <button type="button" className={group.extras.length ? "pkg-row has-extra" : "pkg-row"} onClick={() => onSelect(base)}>
        <span><b>{t(labelOf(base))}</b>{sub ? <small>{sub}</small> : null}</span>
        <strong>{money(base.price)} ฿</strong>
      </button>
      {group.extras.length ? <ExtraPanel label="Extra" rows={group.extras.map((extra) => extraRow(kind, base, extra, onSelect))} /> : null}
    </div>
  );
}

// Fitness coupon packs (coupons with metadata.tab = "coupon"), grouped with their Extra variants.
export function CouponPacks({ coupons, onBuy }: { coupons: Coupon[]; onBuy: (coupon: Coupon) => void }) {
  const groups = groupPackages(coupons.filter((coupon) => parseMeta(coupon.metadata).tab === "coupon"));
  if (!groups.length) return <Empty text={t("ยังไม่มีคูปองเปิดจำหน่าย")} />;
  return (
    <div className="coupon-packs">
      {groups.map((group) => {
        const base = group.base;
        const meta = parseMeta(base.metadata);
        const uses = Number(base.totalUses || 0);
        return (
          <div className="pkg-block" key={group.key}>
            <div className={group.extras.length ? "coupon-pack has-extra" : "coupon-pack"}>
              {typeof meta.badge === "string" ? <span className="badge-best">{t(meta.badge)}</span> : null}
              <span className="cp-count"><b>{uses}</b><small>{t("ใบ")}</small></span>
              <span className="cp-info">
                <b>{t("{{value0}} ใบ / {{value1}}", { value0: uses, value1: validityText(base.validityDays) })}</b>
                <small>{t("{{value0}} ฿ · เฉลี่ย {{value1}} ฿/วัน", { value0: money(base.price), value1: money(perUnit(Number(base.price || 0), uses)) })}</small>
              </span>
              <button type="button" className="cp-add" aria-label={t("ซื้อ {{value0}}", { value0: t(base.name) })} onClick={() => onBuy(base)}>+</button>
            </div>
            {group.extras.length ? (
              <ExtraPanel label="Extra" rows={group.extras.map((extra) => ({
                key: extra.id,
                label: t(labelOf(extra)),
                sub: t("ใช้งานได้ {{value0}}", { value0: validityText(extra.validityDays) }),
                price: Number(extra.price || 0),
                onClick: () => onBuy(extra),
              }))} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CouponTab({ couponStore, onBuyCoupon }: { couponStore: Coupon[]; onBuyCoupon: (coupon: Coupon) => void }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();
  return (
    <>
      <h2 className="plans-subtitle">{t("คูปอง (Fitness)")}</h2>
      <div className="share-note">{t("🤝 คูปอง 1 ใบ สามารถแชร์ให้เพื่อนได้ 1 คน")}</div>
      <CouponPacks coupons={couponStore} onBuy={onBuyCoupon} />
      <button type="button" className="ghost plans-info-btn" aria-expanded={infoOpen} aria-controls={infoId} onClick={() => setInfoOpen((value) => !value)}>{t("ข้อมูลการใช้งาน")}</button>
      <ul className="plans-info" id={infoId} hidden={!infoOpen}>
        <li>{t("คูปอง 1 ใบ ใช้เข้าใช้บริการได้ 1 ครั้ง")}</li>
        <li>{t("เปิด QR จากหน้าคูปองของฉัน แล้วให้เจ้าหน้าที่สแกน ระบบจะหัก 1 ใบต่อการสแกน")}</li>
        <li>{t("ใช้ได้จนถึงวันหมดอายุของคูปอง ต่ออายุได้ที่แท็บต่ออายุ")}</li>
        <li>{t("ชวนเพื่อนมาใช้คูปองร่วมกันได้ 1 คนต่อ 1 ใบ แจ้งเจ้าหน้าที่ที่เคาน์เตอร์")}</li>
      </ul>
    </>
  );
}

function activeMembershipOf(memberships: Membership[], now: number) {
  return memberships
    .filter((membership) => membership.status === "active" && wallClockTime(membership.endsAt) > now)
    .sort((a, b) => wallClockTime(b.endsAt) - wallClockTime(a.endsAt))[0] || null;
}

function PausePanel({ option, data, now, busy, onRequestPause }: { option?: ContentItem; data: PlansData; now: number; busy: boolean; onRequestPause: Props["onRequestPause"] }) {
  const today = bangkokToday(now);
  const [startDate, setStartDate] = useState(today);
  const [days, setDays] = useState(30);
  if (!option) return <Empty text={t("ยังไม่เปิดให้ขอพักการใช้งานแพ็กเกจ")} />;
  const dayChoices = pauseDayChoices(numberMeta(option, "maxDays") || undefined);
  const selectedDays = dayChoices.includes(days) ? days : dayChoices[dayChoices.length - 1];
  const membership = activeMembershipOf(data.memberships, now);
  const pauses = membership ? data.membershipPauses.filter((pause) => Number(pause.membershipId) === Number(membership.id)) : [];
  const allowed = membership ? pausesAllowedFor(parseMeta(membership.metadata), membership.startsAt, membership.endsAt) : 0;
  const current = pauses.find((pause) => wallClockTime(pause.startsAt) <= now && wallClockTime(pause.endsAt) > now);
  const upcoming = pauses.find((pause) => wallClockTime(pause.startsAt) > now);
  const pending = membership ? data.pendingPayments.some((payment) => payment.itemType === "membership_pause" && String(payment.refId) === String(membership.id)) : false;
  const remaining = Math.max(0, allowed - pauses.length);
  const reason = !membership ? t("ต้องมีแพ็กเกจ 6 หรือ 12 เดือนที่ใช้งานอยู่") : !allowed ? t("แพ็กเกจนี้ไม่รองรับการพักการใช้งาน") : !remaining ? t("แพ็กเกจนี้ใช้สิทธิ์พักการใช้งานครบแล้ว") : pending ? t("มีคำขอพักการใช้งานรอยืนยันการชำระเงิน") : "";
  const maxStart = addCalendarDays(today, PAUSE_LEAD_DAYS);
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate >= today && startDate <= maxStart;
  return (
    <>
      <div className="renew-card">
        <b>{t("{{value0}} · {{value1}} ฿/ครั้ง", { value0: t(option.title), value1: money(option.price) })}</b>
        {option.subtitle ? <p>{t(option.subtitle)}</p> : null}
      </div>
      <div className="info-row"><span>{t("📦 แพ็กเกจ 6 เดือน")}</span><b>{t("หยุดได้ {{value0}} ครั้ง", { value0: 1 })}</b></div>
      <div className="info-row"><span>{t("📦 แพ็กเกจรายปี (12 เดือน)")}</span><b>{t("หยุดได้ {{value0}} ครั้ง", { value0: 2 })}</b></div>
      {membership ? (
        <div className="renew-status">
          <b>{t(membership.planName)}</b>
          <small>{t("ใช้ได้ถึง {{value0}}", { value0: formatDate(membership.endsAt) })} · {t("ใช้สิทธิ์พักแล้ว {{value0}}/{{value1}} ครั้ง", { value0: pauses.length, value1: allowed })}</small>
          {current ? <small className="renew-flag">{t("กำลังพักการใช้งานถึง {{value0}}", { value0: formatDate(current.endsAt) })}</small> : null}
          {!current && upcoming ? <small className="renew-flag">{t("นัดพักการใช้งาน {{value0}} – {{value1}}", { value0: formatDate(upcoming.startsAt), value1: formatDate(upcoming.endsAt) })}</small> : null}
        </div>
      ) : null}
      {reason ? <p className="renew-note">{reason}</p> : (
        <div className="renew-form">
          <label className="field">{t("วันเริ่มพัก")}<input type="date" min={today} max={maxStart} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="field">{t("จำนวนวันที่พัก")}<select value={selectedDays} onChange={(event) => setDays(Number(event.target.value))}>{dayChoices.map((value) => <option key={value} value={value}>{t("{{value0}} วัน", { value0: value })}</option>)}</select></label>
          <p className="renew-preview">{t("กลับมาใช้ได้ {{value0}} · วันหมดอายุเลื่อนออกไป {{value1}} วัน", { value0: validStart ? formatDate(`${addCalendarDays(startDate, selectedDays)} 00:00:00`) : "-", value1: selectedDays })}</p>
        </div>
      )}
      <button type="button" className="ghost renew-action" disabled={busy || Boolean(reason) || !validStart || !membership} onClick={() => membership && onRequestPause({ membershipId: Number(membership.id), startDate, days: selectedDays, option })}>
        {t("ขอพักการใช้งาน {{value0}} ฿", { value0: money(option.price) })}
      </button>
    </>
  );
}

function CouponRenewPanel({ option, data, now, busy, onRenewCoupon, initialCouponId = 0 }: { option?: ContentItem; data: PlansData; now: number; busy: boolean; onRenewCoupon: Props["onRenewCoupon"]; initialCouponId?: number }) {
  const renewable = [...data.coupons, ...data.expiredCoupons];
  const [selectedId, setSelectedId] = useState(initialCouponId);
  if (!option) return <Empty text={t("ยังไม่เปิดให้ต่ออายุคูปอง")} />;
  const months = numberMeta(option, "months") || 1;
  const selected = renewable.find((coupon) => coupon.id === selectedId) || renewable[0];
  const pending = selected ? data.pendingPayments.some((payment) => payment.itemType === "coupon_renewal" && String(payment.refId) === String(selected.id)) : false;
  const nextExpiry = selected ? addMonthsClamped(Math.max(wallClockTime(selected.expiresAt), now), months) : NaN;
  return (
    <>
      <div className="renew-card coupon">
        <b>{t("{{value0}} · {{value1}} ฿/เดือน", { value0: t(option.title), value1: money(option.price) })}</b>
        {option.subtitle ? <p>{t(option.subtitle)}</p> : null}
      </div>
      {renewable.length ? (
        <div className="renew-form">
          <label className="field">{t("เลือกคูปองที่ต้องการต่ออายุ")}
            <select value={selected?.id || 0} onChange={(event) => setSelectedId(Number(event.target.value))}>
              {renewable.map((coupon) => <option key={coupon.id} value={coupon.id}>{t("{{value0}} · เหลือ {{value1}} · หมดอายุ {{value2}}", { value0: t(coupon.name), value1: coupon.remainingUses ?? 0, value2: formatDate(coupon.expiresAt) })}</option>)}
            </select>
          </label>
          {selected ? <p className="renew-preview">{t("วันหมดอายุใหม่ {{value0}} · จำนวนคงเหลือเท่าเดิม", { value0: Number.isFinite(nextExpiry) ? formatDate(new Date(nextExpiry).toISOString()) : "-" })}</p> : null}
          {pending ? <p className="renew-note">{t("มีคำขอต่ออายุคูปองนี้รอยืนยันการชำระเงิน")}</p> : null}
        </div>
      ) : <Empty text={t("ยังไม่มีคูปองที่ต่ออายุได้")} />}
      <button type="button" className="ghost renew-action" disabled={busy || !selected || pending} onClick={() => selected && onRenewCoupon({ userCouponId: selected.id, option, title: selected.name })}>
        {t("ต่ออายุคูปอง {{value0}} ฿/เดือน", { value0: money(option.price) })}
      </button>
    </>
  );
}

function RenewTabPanel(props: Props) {
  const [sub, setSub] = useState<RenewTab>(props.renewFocus?.sub ?? "package");
  const options = props.contentItems.filter((item) => item.contentType === "renewal_option");
  const optionFor = (kind: string) => options.find((item) => parseMeta(item.metadata).kind === kind);
  return (
    <>
      <div className="plan-tabs renew-tabs" role="tablist" aria-label={t("ประเภทการต่ออายุ")}>
        <button type="button" role="tab" aria-selected={sub === "package"} className={sub === "package" ? "on" : ""} onClick={() => setSub("package")}>{t("แพ็กเกจ")}</button>
        <button type="button" role="tab" aria-selected={sub === "coupon"} className={sub === "coupon" ? "on" : ""} onClick={() => setSub("coupon")}>{t("คูปอง")}</button>
      </div>
      {sub === "package"
        ? <PausePanel option={optionFor("membership_pause")} data={props.data} now={props.now} busy={props.busy} onRequestPause={props.onRequestPause} />
        : <CouponRenewPanel option={optionFor("coupon_renewal")} data={props.data} now={props.now} busy={props.busy} onRenewCoupon={props.onRenewCoupon} initialCouponId={props.renewFocus?.couponId} />}
    </>
  );
}

type Props = {
  tab: PlanTab;
  onTab: (tab: PlanTab) => void;
  contentItems: ContentItem[];
  couponStore: Coupon[];
  data: PlansData;
  now: number;
  busy: boolean;
  onBack: () => void;
  onSelectContent: (item: ContentItem) => void;
  onBuyCoupon: (coupon: Coupon) => void;
  onRequestPause: (input: { membershipId: number; startDate: string; days: number; option: ContentItem }) => void;
  onRenewCoupon: (input: { userCouponId: number; option: ContentItem; title: string }) => void;
  // Opens the Renew tab on a sub-tab / coupon (e.g. "ต่ออายุคูปองนี้" from My coupons).
  renewFocus?: { sub: RenewTab; couponId?: number };
};

// แก้ 2: "แพ็กเกจของฉัน" → package page with Monthly · Time · Coupon · ต่ออายุ tabs.
export function PackagePlansScreen(props: Props) {
  const byTab = (contentType: string, tab: string) => props.contentItems.filter((item) => {
    if (item.contentType !== contentType) return false;
    const itemTab = parseMeta(item.metadata).tab;
    return itemTab === tab || (itemTab === undefined && tab === "monthly");
  });
  const monthly = groupPackages(byTab("membership_plan", "monthly"));
  const time = groupPackages(byTab("time_pass", "time"));
  return (
    <div className="page plans-page">
      <Top title={t("เลือกแพ็กเกจ")} onBack={props.onBack} />
      <div className="plan-tabs" role="tablist" aria-label={t("ประเภทแพ็กเกจ")}>
        {planTabs.map(([key, label]) => (
          <button type="button" role="tab" key={key} aria-selected={props.tab === key} className={props.tab === key ? "on" : ""} onClick={() => props.onTab(key)}>{t(label)}</button>
        ))}
      </div>
      {props.tab === "monthly" ? (
        monthly.length ? monthly.map((group) => (parseMeta(group.base.metadata).featured
          ? <FeaturedPlan key={group.key} group={group} onSelect={props.onSelectContent} />
          : <PackageBlock key={group.key} kind="monthly" group={group} onSelect={props.onSelectContent} />)) : <Empty text={t("ยังไม่มีแพ็กเกจเปิดจำหน่าย")} />
      ) : null}
      {props.tab === "time" ? (
        <>
          <div className="plans-label">{t("TIME · รายครั้ง (FITNESS)")}</div>
          {time.length ? time.map((group) => <PackageBlock key={group.key} kind="time" group={group} onSelect={props.onSelectContent} />) : <Empty text={t("ยังไม่มีแพ็กเกจเปิดจำหน่าย")} />}
        </>
      ) : null}
      {props.tab === "coupon" ? <CouponTab couponStore={props.couponStore} onBuyCoupon={props.onBuyCoupon} /> : null}
      {props.tab === "renew" ? <RenewTabPanel {...props} /> : null}
    </div>
  );
}
