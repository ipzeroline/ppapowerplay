"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { AdminNotice } from "@/components/admin-notice";
import type { Breakdown, DashboardSnapshot, DayTotal, QueuePayment, ScheduleRow } from "@/lib/admin-dashboard";

type Lang = "th" | "en";
type Tab = "bookings" | "members" | "reports" | "system";
type Tone = "ok" | "info" | "warn" | "bad";

const copy = {
  th: {
    title: "ภาพรวมวันนี้", updated: "อัปเดต", refresh: "รีเฟรช", refreshing: "กำลังอัปเดต...", refreshFailed: "อัปเดตไม่สำเร็จ กำลังแสดงข้อมูลล่าสุดที่มี",
    loading: "กำลังโหลดภาพรวม...", loadFailed: "โหลดภาพรวมไม่สำเร็จ", retry: "ลองใหม่",
    attention: "ต้องทำตอนนี้", allClear: "เรียบร้อย", view: "ดูรายการ", open: "เปิด",
    slips: "สลิปรอตรวจ", slipsHint: (wait: string) => `สลิปที่รอนานสุด ${wait}`, unpaid: "รอชำระ ยังไม่ส่งสลิป", unpaidHint: "สมาชิกชำระที่เคาน์เตอร์หรือยกเลิกเองได้",
    refunds: "รอคืนเงิน", refundsHint: "โอนคืนแล้วกดบันทึกคืนเงินแล้ว", expiring: "แพ็กเกจหมดใน 7 วัน", expiringHint: "ติดต่อเสนอต่ออายุ",
    maintenance: "สนามปิดซ่อม", maintenanceHint: (total: number) => `จากทั้งหมด ${total} สนาม`, system: "รายการระบบที่ต้องตรวจ", systemHint: "ความปลอดภัยและการตั้งค่า",
    queue: "รายการรอยืนยันและรอคืนเงิน",
    today: "วันนี้", visits: "เข้าใช้บริการ", bookingsToday: "การจองวันนี้", checkedIn: (n: number) => `เข้าใช้แล้ว ${n}`, salesToday: "ยอดขายวันนี้", newMembers: "สมาชิกใหม่",
    courts: (available: number, total: number, maintenance: number) => `สนามพร้อมใช้ ${available} จาก ${total}${maintenance ? ` · ปิดซ่อม ${maintenance}` : ""}`,
    schedule: "สนามวันนี้: กำลังเล่นและถัดไป", noBookings: "วันนี้ยังไม่มีการจองสนาม", scheduleDone: "การจองของวันนี้จบครบแล้ว", more: (n: number) => `อีก ${n} รายการ`, allBookings: "ดูการจองทั้งหมด",
    playing: "กำลังเล่น", done: "จบแล้ว", status: { paid: "ชำระแล้ว", checked_in: "เข้าใช้แล้ว", pending_payment: "รอชำระ", hold: "รอชำระ" } as Record<string, string>,
    month: "เดือนนี้", sales: "ยอดขาย", salesNote: "ไม่รวมเติม Wallet", change: (pct: number) => `${pct > 0 ? "+" : ""}${pct}% จากเดือนก่อน ช่วงเดียวกัน`, noBaseline: "เดือนก่อนยังไม่มียอดให้เทียบ",
    orders: "รายการขาย", cashIn: "เงินเข้า", cashInNote: "ไม่รวมที่จ่ายด้วย Wallet", topups: "เติม Wallet",
    daily: "ยอดขาย 30 วันล่าสุด", showTable: "ดูเป็นตาราง", showChart: "ดูเป็นกราฟ", date: "วันที่", amount: "ยอดขาย", count: "รายการ", transactions: "รายการ",
    byCategory: "ยอดขายตามประเภท", byChannel: "เงินเข้าตามช่องทาง", noSales: "ยังไม่มียอดในเดือนนี้",
    members: "สมาชิก", activeMembers: "สมาชิกทั้งหมด", withMembership: "มีแพ็กเกจใช้งาน", newThisMonth: "สมาชิกใหม่เดือนนี้",
    expiringTitle: "แพ็กเกจที่จะหมดใน 7 วัน", noExpiring: "ไม่มีแพ็กเกจที่จะหมดใน 7 วัน", endsIn: (date: string, days: number) => `หมด ${date} · ${days <= 0 ? "วันนี้" : `อีก ${days} วัน`}`,
    waitMinutes: (m: number) => (m < 60 ? `${m} นาที` : m < 1440 ? `${Math.floor(m / 60)} ชม. ${m % 60} นาที` : `${Math.floor(m / 1440)} วัน ${Math.floor((m % 1440) / 60)} ชม.`),
  },
  en: {
    title: "Today at a glance", updated: "Updated", refresh: "Refresh", refreshing: "Updating...", refreshFailed: "Update failed. Showing the latest figures available.",
    loading: "Loading the overview...", loadFailed: "Could not load the overview", retry: "Try again",
    attention: "Needs attention", allClear: "All clear", view: "View", open: "Open",
    slips: "Slips to check", slipsHint: (wait: string) => `Oldest slip waiting ${wait}`, unpaid: "Awaiting payment, no slip yet", unpaidHint: "Members can pay at the counter or cancel",
    refunds: "Refunds due", refundsHint: "Transfer back, then record the refund", expiring: "Packages ending in 7 days", expiringHint: "Call to offer a renewal",
    maintenance: "Courts in maintenance", maintenanceHint: (total: number) => `Out of ${total} courts`, system: "System items to review", systemHint: "Security and settings",
    queue: "Waiting payments and refunds due",
    today: "Today", visits: "Visits", bookingsToday: "Bookings today", checkedIn: (n: number) => `${n} checked in`, salesToday: "Sales today", newMembers: "New members",
    courts: (available: number, total: number, maintenance: number) => `${available} of ${total} courts open${maintenance ? ` · ${maintenance} in maintenance` : ""}`,
    schedule: "Courts today: playing and next", noBookings: "No court bookings today yet", scheduleDone: "Today's bookings have all finished", more: (n: number) => `${n} more`, allBookings: "All bookings",
    playing: "Playing now", done: "Finished", status: { paid: "Paid", checked_in: "Checked in", pending_payment: "Awaiting payment", hold: "Awaiting payment" } as Record<string, string>,
    month: "This month", sales: "Sales", salesNote: "Excludes wallet top-ups", change: (pct: number) => `${pct > 0 ? "+" : ""}${pct}% vs last month to date`, noBaseline: "No sales last month to compare",
    orders: "Sales orders", cashIn: "Cash in", cashInNote: "Excludes wallet-funded payments", topups: "Wallet top-ups",
    daily: "Sales, last 30 days", showTable: "Show table", showChart: "Show chart", date: "Date", amount: "Sales", count: "Orders", transactions: "orders",
    byCategory: "Sales by type", byChannel: "Cash in by channel", noSales: "No sales this month yet",
    members: "Members", activeMembers: "All members", withMembership: "With an active package", newThisMonth: "New this month",
    expiringTitle: "Packages ending in 7 days", noExpiring: "No packages end in the next 7 days", endsIn: (date: string, days: number) => `Ends ${date} · ${days <= 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
    waitMinutes: (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`),
  },
};

const categoryLabels: Record<Lang, Record<string, string>> = {
  th: { membership: "แพ็กเกจสมาชิก", time_pass: "บัตรรายครั้ง/รายสัปดาห์", coupon: "คูปอง", booking: "จองสนาม", class: "คลาสและบริการ", trainer: "เทรนเนอร์ส่วนตัว", membership_pause: "พักแพ็กเกจ", coupon_renewal: "ต่ออายุคูปอง", other: "อื่นๆ" },
  en: { membership: "Memberships", time_pass: "Time passes", coupon: "Coupons", booking: "Court bookings", class: "Classes and services", trainer: "Personal training", membership_pause: "Package pauses", coupon_renewal: "Coupon renewals", other: "Other" },
};
const channelLabels: Record<Lang, Record<string, string>> = {
  th: { promptpay: "พร้อมเพย์", cash: "เงินสด", card: "บัตร", line_pay: "LINE Pay", other: "อื่นๆ" },
  en: { promptpay: "PromptPay", cash: "Cash", card: "Card", line_pay: "LINE Pay", other: "Other" },
};

const isQueued = (row: QueuePayment) => row.status === "created" || (row.status === "cancelled" && row.refundStatus === "pending");
// Calendar day in Bangkok (YYYY-MM-DD), comparable with snapshot.today.
const bangkokDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);

function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((step) => step * magnitude).find((step) => step >= value) ?? 10 * magnitude);
}

export function AdminDashboard({ initial, lang, systemIssues, onNavigate, renderQueue }: {
  initial?: DashboardSnapshot;
  lang: Lang;
  systemIssues: number | null;
  onNavigate: (tab: Tab) => void;
  renderQueue: (rows: QueuePayment[], onChange: (payments: QueuePayment[]) => void) => React.ReactNode;
}) {
  const c = copy[lang];
  const locale = lang === "th" ? "th-TH" : "en-GB";
  const [snapshot, setSnapshot] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(String(response.status));
      setSnapshot(await response.json());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // New slips and bookings appear without a reload: refresh every minute while the tab is visible.
  // A missing first snapshot, or one from a while ago (the console was opened on another tab and the
  // dashboard is opened later), loads at once instead of waiting for the first minute.
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const stale = !initial || Date.now() - Date.parse(initial.generatedAt) > 60_000;
    const first = stale ? window.setTimeout(() => void refresh(), 0) : undefined;
    const timer = window.setInterval(() => { if (visible()) void refresh(); }, 60_000);
    const onVisibility = () => { if (visible()) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initial, refresh]);

  if (!snapshot) {
    return (
      <div className="dash">
        <header className="dash-head">
          <div><h1>{c.title}</h1></div>
          <div className="dash-refresh">
            {failed
              ? <AdminNotice tone="error" lang={lang} action={<button type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? c.refreshing : c.retry}</button>}>{c.loadFailed}</AdminNotice>
              : <span role="status">{c.loading}</span>}
          </div>
        </header>
      </div>
    );
  }

  const baht = (value: number) => `${Math.round(value).toLocaleString(locale)} ฿`;
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  const dayLabel = (day: string, long = false) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString(locale, long ? { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" } : { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
  const now = Date.parse(snapshot.generatedAt);
  const { queue, sales, schedule, bookingsToday, courts, members } = snapshot;

  const onQueueChange = (payments: QueuePayment[]) => {
    // Show the decision at once, then reload the counts.
    setSnapshot((current) => (current?.queue ? { ...current, queue: { ...current.queue, rows: payments.filter(isQueued) } } : current));
    void refresh();
  };
  const scrollTo = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const actions: { key: string; label: string; hint: string; count: number; tone: Tone; go?: () => void; goLabel?: string }[] = [];
  if (queue) {
    const unpaid = Math.max(queue.awaiting - queue.withSlip, 0);
    actions.push({ key: "slips", label: c.slips, hint: queue.withSlip && queue.oldestSlipMinutes !== null ? c.slipsHint(c.waitMinutes(queue.oldestSlipMinutes)) : c.allClear, count: queue.withSlip, tone: queue.withSlip ? "warn" : "ok", go: queue.withSlip ? () => scrollTo("dash-queue") : undefined, goLabel: c.view });
    actions.push({ key: "unpaid", label: c.unpaid, hint: unpaid ? c.unpaidHint : c.allClear, count: unpaid, tone: unpaid ? "info" : "ok", go: unpaid ? () => scrollTo("dash-queue") : undefined, goLabel: c.view });
    actions.push({ key: "refunds", label: c.refunds, hint: queue.refundsDue ? c.refundsHint : c.allClear, count: queue.refundsDue, tone: queue.refundsDue ? "bad" : "ok", go: queue.refundsDue ? () => scrollTo("dash-queue") : undefined, goLabel: c.view });
  }
  if (members) actions.push({ key: "expiring", label: c.expiring, hint: members.expiring.length ? c.expiringHint : c.allClear, count: members.expiring.length, tone: members.expiring.length ? "info" : "ok", go: members.expiring.length ? () => scrollTo("dash-members") : undefined, goLabel: c.view });
  if (courts) actions.push({ key: "maintenance", label: c.maintenance, hint: c.maintenanceHint(courts.total), count: courts.maintenance, tone: courts.maintenance ? "warn" : "ok", go: courts.maintenance ? () => onNavigate("bookings") : undefined, goLabel: c.open });
  if (systemIssues !== null) actions.push({ key: "system", label: c.system, hint: systemIssues ? c.systemHint : c.allClear, count: systemIssues, tone: systemIssues ? "warn" : "ok", go: systemIssues ? () => onNavigate("system") : undefined, goLabel: c.open });

  const visibleSchedule = (schedule ?? []).slice(0, 12);

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>{c.title}</h1>
          <p>{dayLabel(snapshot.today, true)}</p>
        </div>
        <div className="dash-refresh">
          {failed ? <AdminNotice tone="warning" lang={lang} className="dash-stale">{c.refreshFailed}</AdminNotice> : <span role="status">{`${c.updated} ${clock(snapshot.generatedAt)}`}</span>}
          <button type="button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw aria-hidden="true" />{refreshing ? c.refreshing : c.refresh}</button>
        </div>
      </header>

      <div className="dash-top">
        {actions.length ? (
          <section className="dash-panel" aria-labelledby="dash-attention">
            <h2 id="dash-attention">{c.attention}</h2>
            <ul className="dash-actions">
              {actions.map((action) => (
                <li key={action.key} className={`dash-action ${action.tone}`}>
                  <span className="dash-action-mark" aria-hidden="true">{action.tone === "ok" ? <CircleCheck /> : action.tone === "info" ? <Info /> : action.tone === "warn" ? <TriangleAlert /> : <CircleAlert />}</span>
                  <div><b>{action.label}</b><small>{action.hint}</small></div>
                  <strong>{action.count}</strong>
                  {action.go ? <button type="button" onClick={action.go}>{action.goLabel}</button> : <span className="dash-action-spacer" />}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="dash-panel" aria-labelledby="dash-today">
          <h2 id="dash-today">{c.today}</h2>
          <dl className="dash-figures">
            <div><dt>{c.visits}</dt><dd>{snapshot.visitsToday.toLocaleString(locale)}</dd></div>
            {bookingsToday ? <div><dt>{c.bookingsToday}</dt><dd>{bookingsToday.total.toLocaleString(locale)}<small>{c.checkedIn(bookingsToday.checkedIn)}</small></dd></div> : null}
            {sales ? <div><dt>{c.salesToday}</dt><dd>{baht(sales.today)}</dd></div> : null}
            {members ? <div><dt>{c.newMembers}</dt><dd>{members.newToday.toLocaleString(locale)}</dd></div> : null}
          </dl>
          {courts ? <p className="dash-courts">{c.courts(courts.available, courts.total, courts.maintenance)}</p> : null}
          {schedule ? (
            <div className="dash-schedule-wrap">
              <h3>{c.schedule}</h3>
              {visibleSchedule.length ? (
                <ol className="dash-schedule">
                  {visibleSchedule.map((row) => <ScheduleItem key={row.bookingNo} row={row} now={now} clock={clock} c={c} />)}
                </ol>
              ) : <p className="dash-empty">{bookingsToday?.total ? c.scheduleDone : c.noBookings}</p>}
              {schedule.length || bookingsToday?.total ? (
                <button type="button" className="dash-link" onClick={() => onNavigate("bookings")}>{schedule.length > visibleSchedule.length ? `${c.more(schedule.length - visibleSchedule.length)} · ` : ""}{c.allBookings}</button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {queue ? (
        <section className="dash-panel" id="dash-queue" aria-labelledby="dash-queue-title">
          <h2 id="dash-queue-title">{c.queue}</h2>
          <div className="dash-queue">{renderQueue(queue.rows, onQueueChange)}</div>
        </section>
      ) : null}

      {sales ? (
        <section className="dash-panel" aria-labelledby="dash-month">
          <h2 id="dash-month">{c.month}</h2>
          <dl className="dash-figures noted">
            <div><dt>{c.sales}<small>{c.salesNote}</small></dt><dd>{baht(sales.month)}<small className={sales.change === null ? "" : sales.change >= 0 ? "up" : "down"}>{sales.change === null ? c.noBaseline : c.change(sales.change)}</small></dd></div>
            <div><dt>{c.orders}</dt><dd>{sales.monthCount.toLocaleString(locale)}</dd></div>
            <div><dt>{c.cashIn}<small>{c.cashInNote}</small></dt><dd>{baht(sales.cashInMonth)}</dd></div>
            <div><dt>{c.topups}</dt><dd>{baht(sales.topupsMonth)}</dd></div>
          </dl>
          <div className="dash-month-grid">
            <SalesColumns days={sales.daily} c={c} baht={baht} dayLabel={dayLabel} />
            <div className="dash-breakdowns">
              <RankedBars title={c.byCategory} rows={sales.byCategory} label={(key) => categoryLabels[lang][key] ?? key} baht={baht} empty={c.noSales} />
              <RankedBars title={c.byChannel} rows={sales.byChannel} label={(key) => channelLabels[lang][key] ?? key} baht={baht} empty={c.noSales} />
            </div>
          </div>
        </section>
      ) : null}

      {members ? (
        <section className="dash-panel" id="dash-members" aria-labelledby="dash-members-title">
          <h2 id="dash-members-title">{c.members}</h2>
          <dl className="dash-figures">
            <div><dt>{c.activeMembers}</dt><dd>{members.active.toLocaleString(locale)}</dd></div>
            <div><dt>{c.withMembership}</dt><dd>{members.withMembership.toLocaleString(locale)}</dd></div>
            <div><dt>{c.newThisMonth}</dt><dd>{members.newMonth.toLocaleString(locale)}</dd></div>
          </dl>
          <h3>{c.expiringTitle}</h3>
          {members.expiring.length ? (
            <ul className="dash-people">
              {members.expiring.map((row) => {
                // Calendar days: a package ending tonight ends "today", not "in 1 day".
                const daysLeft = Math.round((Date.parse(bangkokDay(row.endsAt)) - Date.parse(snapshot.today)) / 86_400_000);
                return (
                  <li key={row.id}>
                    <div><b>{row.displayName}</b><small>{row.memberCode} · {row.planName}</small></div>
                    <span className={daysLeft <= 2 ? "soon" : ""}>{c.endsIn(new Date(row.endsAt).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }), daysLeft)}</span>
                    {row.phone ? <a href={`tel:${row.phone.replace(/[^\d+]/g, "")}`}>{row.phone}</a> : <span className="dash-muted">-</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="dash-empty">{c.noExpiring}</p>}
          <button type="button" className="dash-link" onClick={() => onNavigate("members")}>{lang === "th" ? "ไปหน้าสมาชิก" : "Open members"}</button>
        </section>
      ) : null}
    </div>
  );
}

function ScheduleItem({ row, now, clock, c }: { row: ScheduleRow; now: number; clock: (iso: string) => string; c: (typeof copy)[Lang] }) {
  const start = Date.parse(row.startsAt);
  const end = Date.parse(row.endsAt);
  const phase = end <= now ? "done" : start <= now ? "playing" : "upcoming";
  return (
    <li className={`dash-slot ${phase}`}>
      <time dateTime={row.startsAt}>{clock(row.startsAt)}–{clock(row.endsAt)}</time>
      <div><b>{row.courtName || row.sportName}</b><small>{row.courtName ? `${row.sportName} · ` : ""}{row.displayName}</small></div>
      <span className={`dash-slot-status ${row.status}`}>{phase === "playing" ? c.playing : phase === "done" && row.status !== "checked_in" ? c.done : c.status[row.status] ?? row.status}</span>
    </li>
  );
}

// Single series, so no legend: the title names it. Today's column carries the accent, earlier days a
// quieter step of the same hue. One focusable bar at a time (arrow keys move), and a table view.
function SalesColumns({ days, c, baht, dayLabel }: { days: DayTotal[]; c: (typeof copy)[Lang]; baht: (value: number) => string; dayLabel: (day: string) => string }) {
  const [active, setActive] = useState(days.length - 1);
  const [asTable, setAsTable] = useState(false);
  const bars = useRef<(HTMLButtonElement | null)[]>([]);
  const top = niceCeiling(Math.max(...days.map((day) => day.total), 0));
  const ticks = [top, top / 2, 0];
  const compact = (value: number) => (value >= 1000 ? `${Number((value / 1000).toFixed(value % 1000 ? 1 : 0)).toLocaleString()}K` : String(value));
  const index = Math.min(active, days.length - 1);
  const current = days[index];
  // Keep the readout inside the plot at both ends.
  const tooltipLeft = Math.min(Math.max(((index + 0.5) / days.length) * 100, 14), 86);
  const move = (index: number) => {
    const next = Math.max(0, Math.min(days.length - 1, index));
    setActive(next);
    bars.current[next]?.focus();
  };
  return (
    <figure className="dash-chart">
      <figcaption>
        <h3>{c.daily}</h3>
        <button type="button" className="dash-link" aria-pressed={asTable} onClick={() => setAsTable((value) => !value)}>{asTable ? c.showChart : c.showTable}</button>
      </figcaption>
      {asTable ? (
        <div className="dash-chart-table">
          <table>
            <thead><tr><th>{c.date}</th><th className="num">{c.amount}</th><th className="num">{c.count}</th></tr></thead>
            <tbody>{[...days].reverse().map((day) => <tr key={day.day}><td>{dayLabel(day.day)}</td><td className="num">{baht(day.total)}</td><td className="num">{day.count}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="dash-chart-frame">
          <div className="dash-chart-plot">
            {/* Visual readout only: the focused bar's label already says this, a live region would repeat it on every hover. */}
            <div className="dash-chart-tooltip" style={{ left: `${tooltipLeft}%` }} aria-hidden="true">
              <strong>{baht(current.total)}</strong>
              <small>{dayLabel(current.day)} · {current.count} {c.transactions}</small>
            </div>
            {ticks.map((tick) => <span key={tick} className="dash-chart-grid" style={{ bottom: `${(tick / top) * 100}%` }} aria-hidden="true"><em>{compact(tick)}</em></span>)}
            <div className="dash-chart-bars" role="group" aria-label={c.daily}>
              {days.map((day, index) => (
                <button
                  key={day.day}
                  type="button"
                  ref={(node) => { bars.current[index] = node; }}
                  className={`${index === days.length - 1 ? "today" : ""} ${index === active ? "active" : ""}`}
                  tabIndex={index === Math.min(active, days.length - 1) ? 0 : -1}
                  aria-label={`${dayLabel(day.day)} ${baht(day.total)} ${day.count} ${c.transactions}`}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") { event.preventDefault(); move(index + 1); }
                    if (event.key === "ArrowLeft") { event.preventDefault(); move(index - 1); }
                    if (event.key === "Home") { event.preventDefault(); move(0); }
                    if (event.key === "End") { event.preventDefault(); move(days.length - 1); }
                  }}
                >
                  <span style={{ height: `${(day.total / top) * 100}%` }} />
                </button>
              ))}
            </div>
          </div>
          <div className="dash-chart-x" aria-hidden="true">
            {days.map((day, index) => ((days.length - 1 - index) % 7 === 0 ? <span key={day.day} style={{ left: `${((index + 0.5) / days.length) * 100}%` }}>{dayLabel(day.day)}</span> : null))}
          </div>
        </div>
      )}
    </figure>
  );
}

// Part-to-whole read by comparing parts: ranked horizontal bars in one hue, value at the tip.
function RankedBars({ title, rows, label, baht, empty }: { title: string; rows: Breakdown[]; label: (key: string) => string; baht: (value: number) => string; empty: string }) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const shown = sorted.length > 6 ? [...sorted.slice(0, 5), { key: "other", total: sorted.slice(5).reduce((sum, row) => sum + row.total, 0), count: sorted.slice(5).reduce((sum, row) => sum + row.count, 0) }] : sorted;
  const total = shown.reduce((sum, row) => sum + row.total, 0);
  const top = shown[0]?.total ?? 0;
  return (
    <div className="dash-ranked">
      <h3>{title}</h3>
      {shown.length && total > 0 ? (
        <ul>
          {shown.map((row) => (
            <li key={row.key}>
              <span className="dash-ranked-label">{label(row.key)}</span>
              <span className="dash-ranked-track" aria-hidden="true"><span style={{ width: `${top ? Math.max((row.total / top) * 100, 1.5) : 0}%` }} /></span>
              <span className="dash-ranked-value">{baht(row.total)}<small>{Math.round((row.total / total) * 100)}%</small></span>
            </li>
          ))}
        </ul>
      ) : <p className="dash-empty">{empty}</p>}
    </div>
  );
}
