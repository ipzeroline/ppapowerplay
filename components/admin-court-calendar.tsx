"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Lock, Plus, Receipt } from "lucide-react";
import { AdminDialog } from "@/components/admin-dialog";
import { useAdminFeedback } from "@/components/admin-feedback";
import { AdminNotice } from "@/components/admin-notice";
import type { NoticeTone } from "@/lib/admin-notices";
import { rateForSlot } from "@/lib/court-pricing";

// Court calendar for the counter (Bookings tab): one day, courts × opening hours. Staff book a free
// slot for a member or a walk-in guest (once or weekly, pay now or later), take payment, check in,
// cancel, and block courts for maintenance or events. The server re-checks every slot.

type Lang = "th" | "en";
type Method = "cash" | "card" | "promptpay";
type CalendarCourt = { id: number; name: string; sportId: number; sportName: string; status: string; capacity?: number | string | null; hourlyRate?: number | string | null; baseRate?: number | string | null };
type CalendarBooking = { bookingNo: string; courtId: number; startsAt: string; endsAt: string; status: string; name: string; phone: string | null; guest: boolean; amount: number | string; title: string; seriesKey: string | null; paymentNo: string | null };
type CalendarBlock = { id: number; courtId: number; startsAt: string; endsAt: string; reason: string };
type CalendarDay = { date: string; courts: CalendarCourt[]; bookings: CalendarBooking[]; blocks: CalendarBlock[] };
type Skipped = { date: string; reason: string };
type MemberHit = { id: number; displayName: string; memberCode: string; phone: string | null; status: string };
type Cell =
  | { kind: "free"; hour: number }
  | { kind: "booking"; from: number; to: number; booking: CalendarBooking }
  | { kind: "block"; from: number; to: number; block: CalendarBlock };
type Dialog =
  | { kind: "book"; courtId: number; time: string }
  | { kind: "booking"; booking: CalendarBooking }
  | { kind: "block"; courtId: number }
  | { kind: "blockDetail"; block: CalendarBlock };

const OPENS = 8;
const CLOSES = 23;
const HOURS = Array.from({ length: CLOSES - OPENS }, (_, index) => OPENS + index);
const METHODS: Method[] = ["cash", "card", "promptpay"];
const PHONE = /^\+?[0-9][0-9 -]{5,19}$/;

const th = {
  title: "ตารางสนาม",
  subtitle: "แตะช่องว่างเพื่อจอง แตะรายการเพื่อรับชำระ เช็คอิน หรือยกเลิก",
  previous: "วันก่อนหน้า", next: "วันถัดไป", today: "วันนี้", date: "วันที่", sport: "กีฬา", allSports: "ทุกกีฬา",
  book: "จองสนาม", block: "บล็อกสนาม", court: "สนาม", perHour: "฿/ชม.",
  loading: "กำลังโหลดตารางสนาม…", loadFailed: "โหลดตารางสนามไม่สำเร็จ", retry: "ลองใหม่",
  noCourts: "ยังไม่มีสนามที่เปิดใช้ เพิ่มสนามได้ที่ “จัดการสนาม” ด้านล่าง",
  free: (time: string, court: string) => `ว่าง ${time} ${court}, จอง`,
  closedCourt: "ปิดปรับปรุง", past: "ผ่านเวลาแล้ว",
  statuses: { paid: "ชำระแล้ว", checked_in: "เช็คอินแล้ว", pending_payment: "รอชำระ", hold: "รอชำระ" } as Record<string, string>,
  blocked: "บล็อก", guest: "ลูกค้าทั่วไป", member: "สมาชิก", legend: "สัญลักษณ์",
  summary: (bookings: number, waiting: number, blocks: number) => `การจอง ${bookings} · รอชำระ ${waiting} · บล็อก ${blocks}`,
  bookKicker: "จองจากเคาน์เตอร์", customer: "ลูกค้า",
  searchMember: "ค้นหาสมาชิก", searchHint: "ชื่อ รหัสสมาชิก หรือเบอร์โทร อย่างน้อย 2 ตัวอักษร",
  searching: "กำลังค้นหา…", noMembers: "ไม่พบสมาชิก", change: "เปลี่ยน", inactive: "ไม่ได้ใช้งาน",
  memberSearchDenied: "บัญชีนี้ค้นหาสมาชิกไม่ได้ (ต้องมีสิทธิ์จัดการสมาชิกหรือขายหน้าเคาน์เตอร์) เลือก “ลูกค้าทั่วไป” แทนได้",
  guestName: "ชื่อลูกค้า", phone: "เบอร์โทร", start: "เวลาเริ่ม", duration: "ระยะเวลา",
  hours: (count: number) => `${count} ชั่วโมง`, players: "จำนวนผู้เล่น",
  repeat: "จองซ้ำทุกสัปดาห์", once: "ครั้งเดียว", weeks: (count: number) => `${count} สัปดาห์ (${count} ครั้ง)`,
  payment: "การชำระเงิน", payNow: "ชำระตอนนี้", payLater: "ชำระทีหลัง",
  payLaterHint: "ค้างชำระไว้ที่เคาน์เตอร์ สนามถูกกันไว้จนกว่าจะรับชำระหรือยกเลิก",
  method: "ช่องทางชำระ", methods: { cash: "เงินสด", card: "บัตร", promptpay: "โอน / พร้อมเพย์" } as Record<Method, string>,
  note: "หมายเหตุ (ไม่บังคับ)", price: "ราคา",
  priceEach: (amount: string, count: number) => `${amount} ฿ × ${count} ครั้ง`,
  priceNote: "ระบบคิดราคาจริงตอนบันทึก สัปดาห์ที่ไม่ว่างจะถูกข้ามและไม่คิดเงิน",
  slotTaken: "ช่วงเวลานี้มีการจองหรือบล็อกอยู่แล้ว",
  save: "บันทึกการจอง", saveAndPay: (amount: string) => `บันทึกและรับชำระ ${amount} ฿`, saving: "กำลังบันทึก…", cancel: "ยกเลิก",
  pickMember: "เลือกสมาชิกก่อนบันทึก", fillGuest: "กรอกชื่อและเบอร์โทรลูกค้าให้ครบ",
  booked: (count: number) => `จองแล้ว ${count} รายการ`, paidWith: (method: string) => `รับชำระแล้ว (${method})`, awaiting: "รอชำระที่เคาน์เตอร์",
  skipped: "ข้าม", skipReasons: { booked: "มีการจองแล้ว", blocked: "สนามถูกบล็อก", past: "ผ่านเวลาแล้ว", closed: "นอกเวลาเปิด" } as Record<string, string>,
  bookingNo: "เลขที่การจอง", time: "เวลา", status: "สถานะ", amount: "ยอด", paymentNo: "เลขที่ชำระเงิน",
  takePayment: (amount: string) => `รับชำระ ${amount} ฿`, checkIn: "เช็คอิน", cancelBooking: "ยกเลิกการจอง",
  cancelReason: "เหตุผลที่ยกเลิก", confirmCancel: "ยืนยันยกเลิกการจอง", keep: "เก็บการจองไว้", receipt: "ใบเสร็จ", close: "ปิด",
  paidDone: (paymentNo: string) => `รับชำระแล้ว · ${paymentNo}`, checkedInDone: "เช็คอินแล้ว", cancelledDone: "ยกเลิกการจองแล้ว",
  blockKicker: "ปิดสนามชั่วคราว", blockHint: "ช่วงที่บล็อกจะไม่เปิดให้จอง ทั้งในแอปและที่เคาน์เตอร์",
  from: "ตั้งแต่", to: "ถึง", reason: "เหตุผล", reasons: ["ซ่อมบำรุง", "จัดกิจกรรม", "เช่าเหมา"],
  saveBlock: "บันทึกการบล็อก", blockSaved: "บล็อกสนามแล้ว", blockConflicts: "การจองที่ทับช่วงนี้ (ย้ายหรือยกเลิกก่อน)",
  blockDetail: "การบล็อกสนาม", liftBlock: "ยกเลิกการบล็อก", blockLifted: "ยกเลิกการบล็อกแล้ว",
  confirmCheckIn: "เช็คอินการจองนี้?", confirmCheckInHint: "บันทึกว่าลูกค้ามาใช้สนามแล้ว ทำย้อนกลับไม่ได้",
  confirmLift: "ยกเลิกการบล็อกนี้?", confirmLiftHint: "ช่วงเวลานี้จะเปิดให้จองได้ทันที ทั้งในแอปและที่เคาน์เตอร์",
};
type Copy = typeof th;
const en: Copy = {
  title: "Court schedule",
  subtitle: "Select a free slot to book. Select a booking to take payment, check in or cancel.",
  previous: "Previous day", next: "Next day", today: "Today", date: "Date", sport: "Sport", allSports: "All sports",
  book: "Book a court", block: "Block a court", court: "Court", perHour: "฿/h",
  loading: "Loading the court schedule…", loadFailed: "Could not load the court schedule", retry: "Try again",
  noCourts: "No open courts yet. Add one under “Courts” below.",
  free: (time, court) => `Free ${time} ${court}, book`,
  closedCourt: "Maintenance", past: "Past",
  statuses: { paid: "Paid", checked_in: "Checked in", pending_payment: "Awaiting payment", hold: "Awaiting payment" },
  blocked: "Blocked", guest: "Walk-in guest", member: "Member", legend: "Legend",
  summary: (bookings, waiting, blocks) => `${bookings} bookings · ${waiting} awaiting payment · ${blocks} blocks`,
  bookKicker: "Counter booking", customer: "Customer",
  searchMember: "Find a member", searchHint: "Name, member code or phone, at least 2 characters",
  searching: "Searching…", noMembers: "No members found", change: "Change", inactive: "Inactive",
  memberSearchDenied: "This account cannot look up members (needs member management or counter sales). Book as a walk-in guest instead.",
  guestName: "Customer name", phone: "Phone", start: "Start time", duration: "Duration",
  hours: (count) => `${count} ${count === 1 ? "hour" : "hours"}`, players: "Players",
  repeat: "Repeat weekly", once: "Once", weeks: (count) => `${count} weeks (${count} bookings)`,
  payment: "Payment", payNow: "Pay now", payLater: "Pay later",
  payLaterHint: "Held at the counter: the court stays reserved until payment is taken or the booking is cancelled.",
  method: "Payment method", methods: { cash: "Cash", card: "Card", promptpay: "Transfer / PromptPay" },
  note: "Note (optional)", price: "Price",
  priceEach: (amount, count) => `${amount} ฿ × ${count} bookings`,
  priceNote: "The final price is set when saving. Weeks that are taken are skipped and not charged.",
  slotTaken: "This time already has a booking or a block.",
  save: "Save booking", saveAndPay: (amount) => `Save and take ${amount} ฿`, saving: "Saving…", cancel: "Cancel",
  pickMember: "Choose a member first", fillGuest: "Enter the customer's name and phone number",
  booked: (count) => `Booked ${count} ${count === 1 ? "slot" : "slots"}`, paidWith: (method) => `paid (${method})`, awaiting: "awaiting payment at the counter",
  skipped: "skipped", skipReasons: { booked: "already booked", blocked: "court blocked", past: "in the past", closed: "outside opening hours" },
  bookingNo: "Booking", time: "Time", status: "Status", amount: "Amount", paymentNo: "Payment no.",
  takePayment: (amount) => `Take ${amount} ฿`, checkIn: "Check in", cancelBooking: "Cancel booking",
  cancelReason: "Reason for cancelling", confirmCancel: "Confirm cancellation", keep: "Keep booking", receipt: "Receipt", close: "Close",
  paidDone: (paymentNo) => `Payment taken · ${paymentNo}`, checkedInDone: "Checked in", cancelledDone: "Booking cancelled",
  blockKicker: "Temporary closure", blockHint: "Blocked time cannot be booked in the app or at the counter.",
  from: "From", to: "To", reason: "Reason", reasons: ["Maintenance", "Event", "Private hire"],
  saveBlock: "Save block", blockSaved: "Court blocked", blockConflicts: "Bookings in this time (move or cancel them first)",
  blockDetail: "Court block", liftBlock: "Remove block", blockLifted: "Block removed",
  confirmCheckIn: "Check in this booking?", confirmCheckInHint: "Records that the customer has arrived. This cannot be undone.",
  confirmLift: "Remove this block?", confirmLiftHint: "This time opens for booking at once, in the app and at the counter.",
};
const copy: Record<Lang, Copy> = { th, en };

type RequestFailure = Error & { status?: number; body?: { skipped?: Skipped[]; bookings?: { bookingNo: string; startsAt: string; name: string }[] } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, signal: init?.signal || AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || `Request failed (${response.status})`), { status: response.status, body });
  return body as T;
}
const failure = (error: unknown) => error as RequestFailure;

const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
// Bangkok wall clock: the club's dates and hours, whatever the device's time zone.
const bangkokDate = (now: number) => new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
const bangkokHour = (now: number) => {
  const clock = new Date(now + 7 * 3_600_000);
  return clock.getUTCHours() + clock.getUTCMinutes() / 60;
};
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const isDate = (value: string) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const started = (date: string, hour: number, now: number) => Date.parse(`${date}T${hh(hour)}:00+07:00`) < now;
const money = (value: number | string, lang: Lang) => Number(value || 0).toLocaleString(lang === "th" ? "th-TH" : "en-US");
const dayLabel = (date: string, lang: Lang, long = true) => new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", long ? { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" } : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const clock = (stamp: string) => stamp.slice(11, 16);
const capacityOf = (court?: CalendarCourt) => Math.max(1, Math.min(20, Number(court?.capacity) || 20));
const priceOf = (court: CalendarCourt | undefined, time: string, hours: number) => (court ? rateForSlot(Number(court.baseRate || 0), time, hours, Number(court.hourlyRate || 0) || null) : 0);
const tone = (status: string) => (status === "paid" ? "paid" : status === "checked_in" ? "in" : "held");

// Where a "YYYY-MM-DD HH:MM:SS" stamp falls on `date`'s timeline, in hours.
function position(stamp: string, date: string) {
  const day = stamp.slice(0, 10);
  if (day < date) return OPENS;
  if (day > date) return CLOSES;
  return Number(stamp.slice(11, 13)) + Number(stamp.slice(14, 16)) / 60;
}

// One court's row: bookings and blocks span their hours, every other opening hour is a free cell.
function rowCells(courtId: number, day: CalendarDay): Cell[] {
  const events = [
    ...day.bookings.filter((booking) => booking.courtId === courtId).map((booking) => ({ booking, block: null, start: position(booking.startsAt, day.date), end: position(booking.endsAt, day.date) })),
    ...day.blocks.filter((block) => block.courtId === courtId).map((block) => ({ booking: null, block, start: position(block.startsAt, day.date), end: position(block.endsAt, day.date) })),
  ]
    .map((event) => ({ ...event, from: Math.max(OPENS, Math.floor(event.start)), to: Math.min(CLOSES, Math.ceil(event.end)) }))
    .filter((event) => event.to > event.from)
    .sort((a, b) => a.from - b.from);
  const cells: Cell[] = [];
  let hour = OPENS;
  for (const event of events) {
    const from = Math.max(event.from, hour);
    if (event.to <= from) continue;
    for (; hour < from; hour += 1) cells.push({ kind: "free", hour });
    cells.push(event.booking ? { kind: "booking", from, to: event.to, booking: event.booking } : { kind: "block", from, to: event.to, block: event.block! });
    hour = event.to;
  }
  for (; hour < CLOSES; hour += 1) cells.push({ kind: "free", hour });
  return cells;
}

function bySport(courts: CalendarCourt[]) {
  const groups: { sportId: number; sportName: string; courts: CalendarCourt[] }[] = [];
  for (const court of courts) {
    const group = groups.find((item) => item.sportId === court.sportId);
    if (group) group.courts.push(court);
    else groups.push({ sportId: court.sportId, sportName: court.sportName, courts: [court] });
  }
  return groups;
}

// Taking payment for a held booking: the same request id is reused until the booking or method
// changes, so a retried click after a lost response cannot record the money twice.
function usePayment(bookingNo: string, t: Copy) {
  const [method, setMethod] = useState<Method>("cash");
  const attempt = useRef<{ key: string; requestId: string } | null>(null);
  const pay = async () => {
    const key = `${bookingNo}:${method}`;
    if (attempt.current?.key !== key) attempt.current = { key, requestId: crypto.randomUUID() };
    const result = await request<{ paymentNo: string }>("/api/admin/bookings/pay", { method: "POST", body: JSON.stringify({ bookingNo, method, requestId: attempt.current.requestId }) });
    return t.paidDone(result.paymentNo);
  };
  return { method, setMethod, pay };
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="admin-segment" role="group" aria-label={label}>
      {options.map(([id, text]) => <button aria-pressed={value === id} className={value === id ? "on" : ""} key={id} type="button" onClick={() => onChange(id)}>{text}</button>)}
    </div>
  );
}

function Modal({ kicker, title, subtitle, onClose, closeLabel, children, footer }: { kicker: string; title: string; subtitle?: ReactNode; onClose: () => void; closeLabel: string; children: ReactNode; footer: ReactNode }) {
  return (
    <AdminDialog onClose={onClose}>
      <section className="admin-modal cal-modal">
        <header><div><small>{kicker}</small><h2>{title}</h2>{subtitle ? <span>{subtitle}</span> : null}</div><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></header>
        <div className="cal-modal-body">{children}</div>
        <footer className="cal-modal-actions">{footer}</footer>
      </section>
    </AdminDialog>
  );
}

export function AdminCourtCalendar({ lang, onBookingsChange, refreshKey = 0 }: { lang: Lang; onBookingsChange?: () => void; refreshKey?: number }) {
  const t = copy[lang];
  const [now, setNow] = useState(() => Date.now());
  const [date, setDate] = useState(() => bangkokDate(Date.now()));
  const [sport, setSport] = useState("all");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; day?: CalendarDay; error?: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { notify } = useAdminFeedback();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef("");
  const key = `${date}|${revision}|${refreshKey}`;

  useEffect(() => {
    const controller = new AbortController();
    request<CalendarDay>(`/api/admin/bookings/calendar?${new URLSearchParams({ date })}`, { signal: controller.signal })
      .then((day) => setResult({ key, day }))
      .catch((error) => { if (!controller.signal.aborted) setResult({ key, error: failure(error).message }); });
    return () => controller.abort();
  }, [key, date]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const loading = result?.key !== key;
  const day = result?.day?.date === date ? result.day : null;
  const error = !loading && result?.error ? result.error : "";
  const today = bangkokDate(now);
  const isToday = date === today;
  const courts = useMemo(() => day?.courts ?? [], [day]);
  const sports = useMemo(() => bySport(courts).map(({ sportId, sportName }) => ({ sportId, sportName })), [courts]);
  const visible = sport === "all" ? courts : courts.filter((court) => String(court.sportId) === sport);
  const groups = bySport(visible);
  const bookable = courts.filter((court) => court.status === "available");
  const firstHour = HOURS.find((hour) => !started(date, hour, now));
  const nowHour = bangkokHour(now);

  // Today opens at the current hour (the morning is history by the afternoon rush).
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !day || scrolledFor.current === day.date) return;
    scrolledFor.current = day.date;
    const column = node.querySelector<HTMLElement>(`[data-hour-col="${Math.max(OPENS, Math.min(CLOSES - 1, Math.floor(bangkokHour(Date.now())) - 1))}"]`);
    const label = node.querySelector<HTMLElement>(".cal-corner");
    node.scrollLeft = day.date === bangkokDate(Date.now()) && column && label ? Math.max(0, column.offsetLeft - label.offsetWidth) : 0;
  }, [day]);

  const go = (next: string) => {
    if (!isDate(next)) return;
    setDate(next);
  };
  const changed = (message: string, tone: NoticeTone = "success") => {
    setDialog(null);
    notify(tone, message);
    setRevision((value) => value + 1);
    onBookingsChange?.();
  };
  const defaultCourt = (visible.find((court) => court.status === "available") ?? bookable[0])?.id ?? 0;
  const counts = day ? { bookings: day.bookings.length, waiting: day.bookings.filter((booking) => booking.status === "pending_payment" || booking.status === "hold").length, blocks: day.blocks.length } : null;

  return (
    <section className="admin-panel cal-panel" aria-labelledby="cal-title">
      <header className="cal-header">
        <div>
          <h2 id="cal-title">{t.title}</h2>
          <p>{t.subtitle}</p>
        </div>
        <div className="cal-actions">
          <button className="admin-button" type="button" disabled={!bookable.length || date < today} onClick={() => setDialog({ kind: "block", courtId: defaultCourt })}><Lock aria-hidden="true" />{t.block}</button>
          <button className="primary" type="button" disabled={!bookable.length || firstHour === undefined} onClick={() => setDialog({ kind: "book", courtId: defaultCourt, time: hh(firstHour ?? OPENS) })}><Plus aria-hidden="true" />{t.book}</button>
        </div>
      </header>
      <div className="cal-toolbar">
        <div className="cal-nav" role="group" aria-label={t.date}>
          <button className="admin-button cal-icon" type="button" aria-label={t.previous} title={t.previous} onClick={() => go(shiftDate(date, -1))}><ChevronLeft aria-hidden="true" /></button>
          <button className="admin-button" type="button" aria-pressed={isToday} onClick={() => go(today)}>{t.today}</button>
          <button className="admin-button cal-icon" type="button" aria-label={t.next} title={t.next} onClick={() => go(shiftDate(date, 1))}><ChevronRight aria-hidden="true" /></button>
          <label className="cal-date"><span className="admin-sr-only">{t.date}</span><input type="date" value={date} onChange={(event) => go(event.target.value)} /></label>
        </div>
        <h3 className="cal-day">{dayLabel(date, lang)}{isToday ? <span className="admin-badge good">{t.today}</span> : null}</h3>
        {sports.length > 1 ? (
          <label className="cal-sport"><span className="admin-sr-only">{t.sport}</span>
            <select value={sport} onChange={(event) => setSport(event.target.value)}>
              <option value="all">{t.allSports}</option>
              {sports.map((item) => <option key={item.sportId} value={String(item.sportId)}>{item.sportName}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="cal-meta">
        <ul className="cal-legend" aria-label={t.legend}>
          <li><i className="paid" aria-hidden="true" />{t.statuses.paid}</li>
          <li><i className="held" aria-hidden="true" />{t.statuses.pending_payment}</li>
          <li><i className="in" aria-hidden="true" />{t.statuses.checked_in}</li>
          <li><i className="blocked" aria-hidden="true" />{t.blocked}</li>
        </ul>
        {counts ? <span>{t.summary(counts.bookings, counts.waiting, counts.blocks)}</span> : null}
      </div>
      {error ? (
        <AdminNotice tone="error" className="cal-notice" action={<button className="admin-button" type="button" onClick={() => setRevision((value) => value + 1)}>{t.retry}</button>}>{t.loadFailed}: {error}</AdminNotice>
      ) : !day ? (
        <p className="cal-state" role="status">{t.loading}</p>
      ) : !courts.length ? (
        <p className="cal-state">{t.noCourts}</p>
      ) : (
        <div className="cal-scroll" ref={scrollRef} aria-busy={loading} inert={loading ? true : undefined}>
          <div className="cal-grid">
            <div className="cal-head" aria-hidden="true">
              <span className="cal-corner">{t.court}</span>
              {HOURS.map((hour) => <span className="cal-hour" data-hour-col={hour} key={hour}>{hh(hour)}</span>)}
            </div>
            <div className="cal-body">
              {groups.map((group) => (
                <Fragment key={group.sportId}>
                  {sports.length > 1 ? <div className="cal-group"><span>{group.sportName}</span></div> : null}
                  {group.courts.map((court) => (
                    <CourtRow key={court.id} court={court} day={day} lang={lang} now={now} t={t}
                      onFree={(time) => setDialog({ kind: "book", courtId: court.id, time })}
                      onBooking={(booking) => setDialog({ kind: "booking", booking })}
                      onBlock={(block) => setDialog({ kind: "blockDetail", block })} />
                  ))}
                </Fragment>
              ))}
              {isToday && nowHour >= OPENS && nowHour < CLOSES ? <div className="cal-now" style={{ "--cal-now": (nowHour - OPENS) / (CLOSES - OPENS) } as CSSProperties} aria-hidden="true" /> : null}
            </div>
          </div>
        </div>
      )}
      {day && dialog?.kind === "book" ? <BookingDialog t={t} lang={lang} day={day} courts={bookable} courtId={dialog.courtId} time={dialog.time} now={now} onClose={() => setDialog(null)} onDone={changed} /> : null}
      {day && dialog?.kind === "booking" ? <BookingDetail t={t} lang={lang} booking={dialog.booking} court={courts.find((court) => court.id === dialog.booking.courtId)} onClose={() => setDialog(null)} onDone={changed} /> : null}
      {day && dialog?.kind === "block" ? <BlockDialog t={t} lang={lang} date={date} courts={courts} courtId={dialog.courtId} onClose={() => setDialog(null)} onDone={changed} /> : null}
      {day && dialog?.kind === "blockDetail" ? <BlockDetail t={t} lang={lang} block={dialog.block} court={courts.find((court) => court.id === dialog.block.courtId)} onClose={() => setDialog(null)} onDone={changed} /> : null}
    </section>
  );
}

function CourtRow({ court, day, lang, now, t, onFree, onBooking, onBlock }: { court: CalendarCourt; day: CalendarDay; lang: Lang; now: number; t: Copy; onFree: (time: string) => void; onBooking: (booking: CalendarBooking) => void; onBlock: (block: CalendarBlock) => void }) {
  const closed = court.status !== "available";
  const rate = Number(court.hourlyRate || court.baseRate || 0);
  return (
    <div className="cal-row">
      <div className="cal-court">
        <b>{court.name}</b>
        {closed ? <small className="cal-closed">{t.closedCourt}</small> : rate ? <small>{money(rate, lang)} {t.perHour}</small> : null}
      </div>
      {rowCells(court.id, day).map((cell) => {
        if (cell.kind === "free") {
          const past = started(day.date, cell.hour, now);
          if (past || closed) return <span className={`cal-cell off${past ? " past" : ""}`} data-hours={1} key={`free-${cell.hour}`} title={past ? t.past : t.closedCourt} />;
          return <button className="cal-cell free" data-hours={1} key={`free-${cell.hour}`} type="button" aria-label={t.free(hh(cell.hour), court.name)} onClick={() => onFree(hh(cell.hour))}><Plus aria-hidden="true" /></button>;
        }
        const span = cell.to - cell.from;
        const style = { gridColumn: `span ${span}` };
        if (cell.kind === "block") {
          const time = `${clock(cell.block.startsAt)}–${clock(cell.block.endsAt)}`;
          return (
            <button className="cal-block" data-hours={span} key={`block-${cell.block.id}`} style={style} type="button" title={`${t.blocked} · ${cell.block.reason} · ${time}`} onClick={() => onBlock(cell.block)}>
              <b><Lock aria-hidden="true" />{t.blocked}</b>
              <span>{cell.block.reason}</span>
            </button>
          );
        }
        const booking = cell.booking;
        const status = t.statuses[booking.status] || booking.status;
        const time = `${clock(booking.startsAt)}–${clock(booking.endsAt)}`;
        return (
          <button className={`cal-event ${tone(booking.status)}`} data-hours={span} key={booking.bookingNo} style={style} type="button" title={`${booking.name} · ${status} · ${time}${booking.guest ? ` · ${t.guest}` : ""}`} onClick={() => onBooking(booking)}>
            <b>{booking.name}</b>
            <span>{span > 1 ? `${status} · ${time}` : status}</span>
          </button>
        );
      })}
    </div>
  );
}

function BookingDialog({ t, lang, day, courts, courtId, time, now, onClose, onDone }: { t: Copy; lang: Lang; day: CalendarDay; courts: CalendarCourt[]; courtId: number; time: string; now: number; onClose: () => void; onDone: (message: string, tone?: NoticeTone) => void }) {
  const [form, setForm] = useState(() => {
    const court = courts.find((item) => item.id === courtId) ?? courts[0];
    return { courtId: court?.id ?? 0, date: day.date, time, durationHours: 1, players: Math.min(2, capacityOf(court)), repeatWeeks: 1, kind: "member" as "member" | "guest", guestName: "", guestPhone: "", payNow: false, method: "cash" as Method, note: "" };
  });
  const [member, setMember] = useState<MemberHit | null>(null);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<{ query: string; members: MemberHit[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const attempt = useRef<{ key: string; requestId: string } | null>(null);
  const court = courts.find((item) => item.id === form.courtId);
  const startHour = Number(form.time.slice(0, 2));
  const each = priceOf(court, form.time, form.durationHours);
  const needle = search.trim();
  const shownHits = hits?.query === needle ? hits : null;
  const startOptions = HOURS.filter((hour) => !started(form.date, hour, now) || hh(hour) === form.time);
  const endStamp = `${form.date} ${hh(startHour + form.durationHours)}:00`;
  const startStamp = `${form.date} ${form.time}:00`;
  const taken = form.date === day.date && [...day.bookings, ...day.blocks].some((item) => item.courtId === form.courtId && item.startsAt < endStamp && item.endsAt > startStamp);

  useEffect(() => {
    if (form.kind !== "member" || member || needle.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      request<{ members: MemberHit[] }>(`/api/admin/members?${new URLSearchParams({ search: needle, page: "1" })}`, { signal: controller.signal })
        .then((data) => setHits({ query: needle, members: data.members.slice(0, 6) }))
        .catch((error) => { if (!controller.signal.aborted) setHits({ query: needle, members: [], error: failure(error).status === 403 ? t.memberSearchDenied : failure(error).message }); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [form.kind, member, needle, t]);

  const update = (patch: Partial<typeof form>) => setForm((current) => {
    const next = { ...current, ...patch };
    const hour = Number(next.time.slice(0, 2));
    next.durationHours = Math.min(next.durationHours, CLOSES - hour);
    next.players = Math.min(next.players, capacityOf(courts.find((item) => item.id === next.courtId)));
    return next;
  });

  const submit = async () => {
    setError("");
    setSkipped([]);
    if (form.kind === "member" && !member) return setError(t.pickMember);
    if (form.kind === "guest" && (!form.guestName.trim() || !PHONE.test(form.guestPhone.trim()))) return setError(t.fillGuest);
    const note = form.note.trim();
    const body = {
      courtId: form.courtId, date: form.date, time: form.time, durationHours: form.durationHours, players: form.players,
      customer: form.kind === "member" && member ? { kind: "member", userId: member.id } : { kind: "guest", name: form.guestName.trim(), phone: form.guestPhone.trim() },
      repeatWeeks: form.repeatWeeks, payNow: form.payNow ? { method: form.method } : null, ...(note ? { note } : {}),
    };
    const attemptKey = JSON.stringify(body);
    if (attempt.current?.key !== attemptKey) attempt.current = { key: attemptKey, requestId: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await request<{ created: { bookingNo: string }[]; skipped: Skipped[] }>("/api/admin/bookings", { method: "POST", body: JSON.stringify({ ...body, requestId: attempt.current.requestId }) });
      const parts = [t.booked(result.created.length)];
      if (result.skipped.length) parts.push(`${t.skipped} ${result.skipped.map((item) => `${dayLabel(item.date, lang, false)} (${t.skipReasons[item.reason] || item.reason})`).join(", ")}`);
      parts.push(form.payNow ? t.paidWith(t.methods[form.method]) : t.awaiting);
      // Weeks that could not be booked need telling to the customer: a warning, not a plain success.
      onDone(parts.join(" · "), result.skipped.length ? "warning" : "success");
    } catch (problem) {
      setError(failure(problem).message);
      setSkipped(failure(problem).body?.skipped ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal kicker={t.bookKicker} title={t.book} subtitle={court ? `${court.sportName} · ${court.name}` : undefined} onClose={onClose} closeLabel={t.close} footer={<>
      <button className="admin-button" type="button" onClick={onClose}>{t.cancel}</button>
      <button className="primary" type="button" disabled={busy || !court} onClick={submit}>{busy ? t.saving : form.payNow ? t.saveAndPay(money(each * form.repeatWeeks, lang)) : t.save}</button>
    </>}>
      <div className="admin-form cal-form">
        <label>{t.court}
          <select value={form.courtId} onChange={(event) => update({ courtId: Number(event.target.value) })}>
            {courts.map((item) => <option key={item.id} value={item.id}>{item.sportName} · {item.name}</option>)}
          </select>
        </label>
        <label>{t.date}<input type="date" value={form.date} onChange={(event) => isDate(event.target.value) && update({ date: event.target.value })} /></label>
        <label>{t.start}
          <select value={form.time} onChange={(event) => update({ time: event.target.value })}>
            {startOptions.map((hour) => <option key={hour} value={hh(hour)}>{hh(hour)}</option>)}
          </select>
        </label>
        <label>{t.duration}
          <select value={form.durationHours} onChange={(event) => update({ durationHours: Number(event.target.value) })}>
            {[1, 2, 3, 4].filter((hours) => startHour + hours <= CLOSES).map((hours) => <option key={hours} value={hours}>{t.hours(hours)} ({hh(startHour)}–{hh(startHour + hours)})</option>)}
          </select>
        </label>
        {taken ? <AdminNotice tone="warning" className="wide">{t.slotTaken}</AdminNotice> : null}
        <div className="cal-field wide">
          <span className="cal-label">{t.customer}</span>
          <Choice label={t.customer} value={form.kind} options={[["member", t.member], ["guest", t.guest]]} onChange={(kind) => update({ kind })} />
        </div>
        {form.kind === "member" ? (
          member ? (
            <div className="cal-member wide">
              <div><b>{member.displayName}</b><small>{member.memberCode} · {member.phone || "-"}</small></div>
              <button className="admin-button" type="button" onClick={() => { setMember(null); setSearch(""); }}>{t.change}</button>
            </div>
          ) : (
            <div className="cal-search wide">
              <label>{t.searchMember}<input type="search" value={search} placeholder={t.searchHint} autoComplete="off" onChange={(event) => setSearch(event.target.value)} /></label>
              {needle.length >= 2 ? (
                shownHits?.error ? <AdminNotice tone="error">{shownHits.error}</AdminNotice>
                : !shownHits ? <p className="cal-hint" role="status">{t.searching}</p>
                : !shownHits.members.length ? <p className="cal-hint" role="status">{t.noMembers}</p>
                : (
                  <ul className="cal-hits">
                    {shownHits.members.map((hit) => (
                      <li key={hit.id}>
                        <button type="button" disabled={hit.status !== "active"} onClick={() => setMember(hit)}>
                          <b>{hit.displayName}</b><small>{hit.memberCode} · {hit.phone || "-"}{hit.status !== "active" ? ` · ${t.inactive}` : ""}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          )
        ) : (
          <>
            <label>{t.guestName}<input value={form.guestName} maxLength={160} autoComplete="off" onChange={(event) => update({ guestName: event.target.value })} /></label>
            <label>{t.phone}<input type="tel" inputMode="tel" value={form.guestPhone} maxLength={20} autoComplete="off" onChange={(event) => update({ guestPhone: event.target.value })} /></label>
          </>
        )}
        <label>{t.players}<input type="number" min={1} max={capacityOf(court)} value={form.players} onChange={(event) => update({ players: Math.max(1, Math.round(Number(event.target.value) || 1)) })} /></label>
        <label>{t.repeat}
          <select value={form.repeatWeeks} onChange={(event) => update({ repeatWeeks: Number(event.target.value) })}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((weeks) => <option key={weeks} value={weeks}>{weeks === 1 ? t.once : t.weeks(weeks)}</option>)}
          </select>
        </label>
        <div className="cal-field wide">
          <span className="cal-label">{t.payment}</span>
          <Choice label={t.payment} value={form.payNow ? "now" : "later"} options={[["later", t.payLater], ["now", t.payNow]]} onChange={(value) => update({ payNow: value === "now" })} />
          {form.payNow ? null : <small className="cal-hint">{t.payLaterHint}</small>}
        </div>
        {form.payNow ? (
          <label>{t.method}
            <select value={form.method} onChange={(event) => update({ method: event.target.value as Method })}>
              {METHODS.map((method) => <option key={method} value={method}>{t.methods[method]}</option>)}
            </select>
          </label>
        ) : null}
        <label className={form.payNow ? "" : "wide"}>{t.note}<input value={form.note} maxLength={200} onChange={(event) => update({ note: event.target.value })} /></label>
        <div className="cal-price wide">
          <span>{t.price}</span>
          <strong>{money(each * form.repeatWeeks, lang)} ฿</strong>
          {form.repeatWeeks > 1 ? <small>{t.priceEach(money(each, lang), form.repeatWeeks)}</small> : null}
          <small>{t.priceNote}</small>
        </div>
        {error ? (
          <AdminNotice tone="error" className="wide">
            {error}
            {skipped.length ? <ul className="cal-skips">{skipped.map((item) => <li key={item.date}>{dayLabel(item.date, lang, false)}: {t.skipReasons[item.reason] || item.reason}</li>)}</ul> : null}
          </AdminNotice>
        ) : null}
      </div>
    </Modal>
  );
}

function BookingDetail({ t, lang, booking, court, onClose, onDone }: { t: Copy; lang: Lang; booking: CalendarBooking; court?: CalendarCourt; onClose: () => void; onDone: (message: string) => void }) {
  const { confirm } = useAdminFeedback();
  const { method, setMethod, pay } = usePayment(booking.bookingNo, t);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const held = booking.status === "pending_payment" || booking.status === "hold";
  const status = t.statuses[booking.status] || booking.status;
  const amount = money(booking.amount, lang);
  const time = `${clock(booking.startsAt)}–${clock(booking.endsAt)}`;
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      onDone(await action());
    } catch (problem) {
      setError(failure(problem).message);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (next: "checked_in" | "cancelled") => run(async () => {
    await request("/api/admin/bookings", { method: "PUT", body: JSON.stringify({ bookingNo: booking.bookingNo, status: next, ...(next === "cancelled" ? { reason: reason.trim() } : {}) }) });
    return next === "cancelled" ? t.cancelledDone : t.checkedInDone;
  });
  const checkIn = async () => {
    const day = dayLabel(booking.startsAt.slice(0, 10), lang, false);
    if (!(await confirm({ title: t.confirmCheckIn, message: t.confirmCheckInHint, details: [[t.customer, booking.name], [t.court, court?.name ?? booking.title], [t.time, `${day} ${time}`]], confirmLabel: t.checkIn }))) return;
    await setStatus("checked_in");
  };

  return (
    <Modal kicker={`${t.bookingNo} ${booking.bookingNo}`} title={booking.name} subtitle={`${court?.name ?? booking.title} · ${dayLabel(booking.startsAt.slice(0, 10), lang, false)} ${time}`} onClose={onClose} closeLabel={t.close} footer={<>
      {booking.paymentNo ? <a className="admin-button" href={`/AdminConsole/receipt/${encodeURIComponent(booking.paymentNo)}`} target="_blank" rel="noopener"><Receipt aria-hidden="true" />{t.receipt}</a> : null}
      {!cancelling && booking.status !== "checked_in" ? <button className="admin-button danger" type="button" disabled={busy} onClick={() => setCancelling(true)}>{t.cancelBooking}</button> : null}
      <span className="cal-spacer" aria-hidden="true" />
      <button className="admin-button" type="button" onClick={onClose}>{t.close}</button>
      {booking.status === "paid" ? <button className="primary" type="button" disabled={busy} onClick={() => void checkIn()}>{t.checkIn}</button> : null}
    </>}>
      <dl className="cal-facts">
        <div><dt>{t.customer}</dt><dd>{booking.guest ? t.guest : t.member}</dd></div>
        <div><dt>{t.phone}</dt><dd>{booking.phone ? <a href={`tel:${booking.phone.replace(/[^+\d]/g, "")}`}>{booking.phone}</a> : "-"}</dd></div>
        <div><dt>{t.status}</dt><dd><span className={`admin-badge ${booking.status === "pending_payment" || booking.status === "hold" ? "warn" : "good"}`}>{status}</span></dd></div>
        <div><dt>{t.amount}</dt><dd>{amount} ฿</dd></div>
        {booking.paymentNo ? <div><dt>{t.paymentNo}</dt><dd>{booking.paymentNo}</dd></div> : null}
      </dl>
      {held && !cancelling ? (
        <div className="cal-pay">
          <label>{t.method}
            <select value={method} onChange={(event) => setMethod(event.target.value as Method)}>
              {METHODS.map((item) => <option key={item} value={item}>{t.methods[item]}</option>)}
            </select>
          </label>
          <button className="primary" type="button" disabled={busy} onClick={() => run(pay)}>{t.takePayment(amount)}</button>
        </div>
      ) : null}
      {cancelling ? (
        <div className="cal-cancel">
          <label>{t.cancelReason}<input value={reason} maxLength={255} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="cal-inline-actions">
            <button className="admin-button" type="button" onClick={() => setCancelling(false)}>{t.keep}</button>
            <button className="admin-button danger" type="button" disabled={busy || !reason.trim()} onClick={() => setStatus("cancelled")}>{t.confirmCancel}</button>
          </div>
        </div>
      ) : null}
      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
    </Modal>
  );
}

function BlockDialog({ t, lang, date, courts, courtId, onClose, onDone }: { t: Copy; lang: Lang; date: string; courts: CalendarCourt[]; courtId: number; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState({ courtId: courtId || courts[0]?.id || 0, date, from: "08:00", to: "09:00", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<{ bookingNo: string; startsAt: string; name: string }[]>([]);
  const fromHour = Number(form.from.slice(0, 2));
  const setFrom = (from: string) => setForm((current) => ({ ...current, from, to: Number(current.to.slice(0, 2)) > Number(from.slice(0, 2)) ? current.to : hh(Number(from.slice(0, 2)) + 1) }));
  const submit = async () => {
    setError("");
    setConflicts([]);
    setBusy(true);
    try {
      await request("/api/admin/courts/blocks", { method: "POST", body: JSON.stringify({ courtId: form.courtId, date: form.date, from: form.from, to: form.to, reason: form.reason.trim() }) });
      onDone(t.blockSaved);
    } catch (problem) {
      setError(failure(problem).message);
      setConflicts(failure(problem).body?.bookings ?? []);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal kicker={t.blockKicker} title={t.block} subtitle={t.blockHint} onClose={onClose} closeLabel={t.close} footer={<>
      <button className="admin-button" type="button" onClick={onClose}>{t.cancel}</button>
      <button className="primary" type="button" disabled={busy || !form.reason.trim()} onClick={submit}>{t.saveBlock}</button>
    </>}>
      <div className="admin-form cal-form">
        <label>{t.court}
          <select value={form.courtId} onChange={(event) => setForm({ ...form, courtId: Number(event.target.value) })}>
            {courts.map((court) => <option key={court.id} value={court.id}>{court.sportName} · {court.name}</option>)}
          </select>
        </label>
        <label>{t.date}<input type="date" value={form.date} onChange={(event) => isDate(event.target.value) && setForm({ ...form, date: event.target.value })} /></label>
        <label>{t.from}
          <select value={form.from} onChange={(event) => setFrom(event.target.value)}>
            {HOURS.map((hour) => <option key={hour} value={hh(hour)}>{hh(hour)}</option>)}
          </select>
        </label>
        <label>{t.to}
          <select value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })}>
            {HOURS.map((hour) => hour + 1).filter((hour) => hour > fromHour).map((hour) => <option key={hour} value={hh(hour)}>{hh(hour)}</option>)}
          </select>
        </label>
        <label className="wide">{t.reason}<input value={form.reason} maxLength={160} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        <div className="cal-chips wide">
          {t.reasons.map((reason) => <button className="admin-button" key={reason} type="button" aria-pressed={form.reason === reason} onClick={() => setForm({ ...form, reason })}>{reason}</button>)}
        </div>
        {error ? (
          <AdminNotice tone="error" className="wide">
            {error}
            {conflicts.length ? <><b className="cal-conflict-title">{t.blockConflicts}</b><ul className="cal-skips">{conflicts.map((row) => <li key={row.bookingNo}>{clock(row.startsAt)} · {row.name} · {row.bookingNo}</li>)}</ul></> : null}
          </AdminNotice>
        ) : null}
        <p className="cal-hint wide">{dayLabel(form.date, lang)}</p>
      </div>
    </Modal>
  );
}

function BlockDetail({ t, lang, block, court, onClose, onDone }: { t: Copy; lang: Lang; block: CalendarBlock; court?: CalendarCourt; onClose: () => void; onDone: (message: string) => void }) {
  const { confirm } = useAdminFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const when = `${dayLabel(block.startsAt.slice(0, 10), lang, false)} ${clock(block.startsAt)}–${clock(block.endsAt)}`;
  const lift = async () => {
    if (!(await confirm({ title: t.confirmLift, message: t.confirmLiftHint, details: [[t.court, court?.name ?? "-"], [t.time, when], [t.reason, block.reason]], confirmLabel: t.liftBlock, danger: true }))) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/courts/blocks?${new URLSearchParams({ id: String(block.id) })}`, { method: "DELETE" });
      onDone(t.blockLifted);
    } catch (problem) {
      setError(failure(problem).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal kicker={t.blockDetail} title={block.reason} subtitle={`${court?.name ?? ""} · ${when}`} onClose={onClose} closeLabel={t.close} footer={<>
      <button className="admin-button danger" type="button" disabled={busy} onClick={lift}>{t.liftBlock}</button>
      <span className="cal-spacer" aria-hidden="true" />
      <button className="admin-button" type="button" onClick={onClose}>{t.close}</button>
    </>}>
      <p className="cal-hint">{t.blockHint}</p>
      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
    </Modal>
  );
}

// "รับชำระ" from the bookings list: the same payment call as the calendar's booking detail.
export function CounterPaymentDialog({ lang, booking, onClose, onDone }: { lang: Lang; booking: { bookingNo: string; title: string; displayName: string; amount: number | string }; onClose: () => void; onDone: (message: string) => void }) {
  const t = copy[lang];
  const { method, setMethod, pay } = usePayment(booking.bookingNo, t);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amount = money(booking.amount, lang);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      onDone(await pay());
    } catch (problem) {
      setError(failure(problem).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal kicker={`${t.bookingNo} ${booking.bookingNo}`} title={booking.displayName} subtitle={booking.title} onClose={onClose} closeLabel={t.close} footer={<>
      <button className="admin-button" type="button" onClick={onClose}>{t.cancel}</button>
      <button className="primary" type="button" disabled={busy} onClick={submit}>{t.takePayment(amount)}</button>
    </>}>
      <div className="cal-pay">
        <label>{t.method}
          <select value={method} onChange={(event) => setMethod(event.target.value as Method)}>
            {METHODS.map((item) => <option key={item} value={item}>{t.methods[item]}</option>)}
          </select>
        </label>
      </div>
      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
    </Modal>
  );
}
