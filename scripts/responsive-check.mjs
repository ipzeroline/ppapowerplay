import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import QRCode from "qrcode";

const base = "http://localhost:3000";
const outDir = "/private/tmp/ppa-responsive";
const fixtureQrSvg = await QRCode.toString("https://example.invalid/qr-test-only", { type: "svg", margin: 1, width: 220 });
const fixtureQrPng = await QRCode.toDataURL("promptpay-fixture-only", { margin: 2, width: 240 });
await mkdir(outDir, { recursive: true });
const stylesheetLinks = (html) => [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((match) => match[0]).join("");
const pageHtml = await (await fetch(base)).text();
// Member fixtures get the member page's styles only; admin and receipt fixtures get the console's.
const styles = stylesheetLinks(pageHtml);
const adminStyles = stylesheetLinks(await (await fetch(`${base}/AdminConsole`)).text());
assert.ok(styles && adminStyles, "The local app must serve its compiled styles");
for (const href of [...styles.matchAll(/href="([^"]+)"/g)].map((match) => match[1])) {
  assert.ok(!(await (await fetch(new URL(href, base))).text()).includes(".admin-console"), `members must not download back-office CSS: ${href}`);
}
const fontClass = pageHtml.match(/<html[^>]+class="([^"]+)"/)?.[1] || "";
const user = { id: 1, displayName: "สมาชิกทดสอบหน้าจอ Responsive Layout", memberCode: "PPA-TEST", phone: "0000000000", email: "test@example.invalid", status: "active" };
const trainer = { id: 1, slug: "coach", name: "Trainer responsive test", nickname: "Coach", role: "Personal Trainer", avatar: "PPA", experience: "5 years", startPrice: 1000, active: true, sortOrder: 1, certifications: [], specialties: [], packages: [], weeklySchedule: [] };
const bookings = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, bookingNo: `BK-TEST-${i}`, title: "ทดสอบรายการจองที่มีชื่อยาวสำหรับทุกขนาดหน้าจอ", displayName: user.displayName, sportName: "Badminton", courtName: "Court A", startsAt: "2026-12-10T10:00:00+07:00", endsAt: "2026-12-10T11:00:00+07:00", status: "paid", amount: 200, players: 2 }));
const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString();
const catalogItem = (id, contentType, title, price, sortOrder, metadata, extra = {}) => ({ id, contentType, slug: `fixture-${id}`, title, price, sortOrder, icon: "", targetScreen: "plans", metadata: JSON.stringify(metadata), ...extra });
const packageCatalog = [
  catalogItem(201, "membership_plan", "Fitness (12 เดือน)", 19200, 110, { tab: "monthly", group: "12m", variant: "base", label: "Fitness (12 เดือน)", featured: true, badge: "คุ้มสุด", perks: ["เข้าใช้ไม่จำกัดตลอด 12 เดือน", "เข้าใช้ฟิตเนสไม่จำกัด", "จองผ่านแอปได้ทันที"], months: 12, pausesAllowed: 2 }, { actionLabel: "เลือกแพ็กเกจนี้" }),
  catalogItem(202, "membership_plan", "Fitness + Swim 12 เดือน", 19700, 111, { tab: "monthly", group: "12m", variant: "swim", label: "Fitness + Swim", months: 12 }),
  catalogItem(203, "membership_plan", "Fitness 1 เดือน", 2000, 120, { tab: "monthly", group: "1m", variant: "base", label: "1 เดือน", months: 1 }, { subtitle: "เข้าใช้ไม่จำกัด" }),
  catalogItem(204, "membership_plan", "Fitness + Hyrox 1 เดือน", 2700, 121, { tab: "monthly", group: "1m", variant: "hyrox", label: "Fitness + Hyrox", months: 1 }),
  catalogItem(205, "membership_plan", "Fitness 6 เดือน", 10885, 130, { tab: "monthly", group: "6m", variant: "base", label: "6 เดือน", months: 6, pausesAllowed: 1 }),
  catalogItem(206, "time_pass", "Fitness 1 ครั้ง", 200, 10, { tab: "time", group: "1d", variant: "base", label: "1 ครั้ง", days: 1, uses: 1 }, { subtitle: "ใช้ได้ 1 วัน" }),
  catalogItem(207, "time_pass", "Fitness + Swim 1 ครั้ง", 300, 11, { tab: "time", group: "1d", variant: "swim", label: "Fitness + Swim", days: 1, uses: 1 }),
  catalogItem(208, "time_pass", "Fitness 1 สัปดาห์", 1000, 20, { tab: "time", group: "1w", variant: "base", label: "1 สัปดาห์", days: 7 }),
  catalogItem(209, "renewal_option", "พักการใช้งานแพ็กเกจ", 500, 10, { kind: "membership_pause", maxDays: 60 }, { subtitle: "หยุดนับอายุแพ็กเกจชั่วคราว สูงสุดไม่เกิน 2 เดือนต่อครั้ง เมื่อกลับมาใช้ วันที่เหลือจะต่อจากเดิม" }),
  catalogItem(210, "renewal_option", "ต่ออายุคูปอง", 500, 20, { kind: "coupon_renewal", months: 1 }, { subtitle: "ขยายวันหมดอายุคูปองออกไปอีก 1 เดือน โดยจำนวนครั้งคงเหลือเท่าเดิม (ใช้ได้เฉพาะคูปองเท่านั้น ไม่รวมแพ็กเกจ)" }),
];
const couponStore = [[10, 1600, 2400, 60, ""], [120, 12000, 18000, 365, "BEST SELLER"]].flatMap(([uses, price, extra, days, badge], index) => [
  { id: 300 + index * 2, code: `FIT-COUPON-${uses}`, name: `คูปอง Fitness ${uses} ใบ`, category: "fitness", price, totalUses: uses, validityDays: days, sortOrder: index * 10, metadata: JSON.stringify({ tab: "coupon", group: `c${uses}`, variant: "base", ...(badge ? { badge } : {}) }) },
  { id: 301 + index * 2, code: `FIT-SWIM-COUPON-${uses}`, name: `คูปอง Fitness + Swim ${uses} ใบ`, category: "fitness-swim", price: extra, totalUses: uses, validityDays: days, sortOrder: index * 10 + 1, metadata: JSON.stringify({ tab: "coupon", group: `c${uses}`, variant: "swim", label: "Fitness + Swim" }) },
]).concat([{ id: 399, code: "PILATES-GROUP-10", name: "Pilates Group 10 ครั้ง", category: "pilates", price: 8500, totalUses: 10, validityDays: 60, sortOrder: 0, metadata: null }]);
const ledgerNote = "ซื้อคูปอง คูปอง Fitness 10 ใบ";
// Coin rewards and club settings (support contact, PDPA policy) edited in AdminConsole.
const launchContent = [
  catalogItem(501, "reward", "น้ำเปล่า PPA", 0, 10, { cost: 5 }, { subtitle: "1 ขวด", icon: "💧", targetScreen: "reward" }),
  catalogItem(502, "reward", "เสื้อกีฬา PPA", 0, 50, { cost: 50 }, { subtitle: "เลือกไซส์ได้ที่เคาน์เตอร์", icon: "👕", targetScreen: "reward" }),
  catalogItem(601, "site_setting", "ช่วยเหลือ & ติดต่อเรา", 0, 10, { phone: "081-111-2222", email: "desk@ppa.example", line: "@ppadesk", lineUrl: "https://lin.ee/ppadesk", hours: "06:00-23:00" }, { slug: "support-contact", targetScreen: "help" }),
  catalogItem(602, "site_setting", "นโยบายความเป็นส่วนตัว", 0, 20, { version: "2026-11-01" }, { slug: "privacy-policy", targetScreen: null, subtitle: "สรุปการเก็บและใช้ข้อมูลส่วนบุคคลของสมาชิก", body: Array.from({ length: 12 }, (_, index) => `${index + 1}. ข้อความนโยบายความเป็นส่วนตัวสำหรับทดสอบการเลื่อนอ่านบนหน้าจอขนาดเล็ก`).join("\n") }),
];
const member = {
  user, wallet: { balance: 2000, coinBalance: 10, pointBalance: 100 }, sports: [{ id: 1, slug: "badminton", name: "Badminton", icon: "PPA", requiresBooking: true, baseRate: 200 }], bookings,
  coupons: [{ id: 401, code: "FIT-COUPON-10", name: "คูปอง Fitness 10 ใบ", category: "fitness", remainingUses: 7, totalUses: 10, purchasedAt: isoIn(-10), expiresAt: isoIn(50) }],
  expiredCoupons: [{ id: 402, code: "FIT-COUPON-30", name: "คูปอง Fitness 30 ใบ", category: "fitness", remainingUses: 4, totalUses: 30, purchasedAt: isoIn(-130), expiresAt: isoIn(-3) }],
  trainers: [trainer],
  groups: [
    { id: 1, name: "Open Run responsive fixture with a long group name", levelName: "พอตัว", sportName: "บาสเกตบอล", sportSlug: "basketball", sportIcon: "🏀", maxPlayers: 10, memberCount: 8, playAt: isoIn(1), joined: 0, isOwner: 0 },
    { id: 2, name: "Badminton Doubles", levelName: "มือใหม่", sportName: "แบดมินตัน", sportSlug: "badminton", sportIcon: "🏸", maxPlayers: 4, memberCount: 3, playAt: isoIn(2), joined: 1, isOwner: 0 },
    { id: 3, name: "Pickleball", levelName: "มือใหม่", sportName: "พิคเคิลบอล", sportSlug: "pickleball", sportIcon: "🥒", maxPlayers: 4, memberCount: 2, playAt: null, joined: 0, isOwner: 1 },
    { id: 4, name: "Tennis full", levelName: "แข่งขัน", sportName: "เทนนิส", sportSlug: "tennis", sportIcon: "🎾", maxPlayers: 4, memberCount: 4, playAt: isoIn(3), joined: 0, isOwner: 0 },
    { id: 5, name: "Weekend", levelName: "พอตัว", sportName: "แบดมินตัน", sportSlug: "badminton", sportIcon: "🏸", maxPlayers: 6, memberCount: 1, playAt: isoIn(4), joined: 0, isOwner: 0 },
  ],
  notifications: [], contentItems: [...packageCatalog, ...launchContent], memberships: [], membershipPauses: [], pendingPayments: [],
  entitlements: [{ id: 701, entitlementType: "reward", title: "น้ำเปล่า PPA", remainingUses: 1, startsAt: isoIn(-1), endsAt: isoIn(29), status: "active" }],
  visits: [{ id: 1, purpose: "member", title: "Fitness (12 เดือน)", createdAt: isoIn(-1) }, { id: 2, purpose: "coupon", title: "คูปอง Fitness 10 ใบ", createdAt: isoIn(-3) }],
  consent: { acceptedAt: isoIn(-1), version: "2026-11-01" },
  walletLedger: [{ id: 1, kind: "payment", amount: -1600, coinDelta: 1, pointDelta: 1600, note: ledgerNote, createdAt: isoIn(-10) }, { id: 2, kind: "topup", amount: 2000, coinDelta: 0, pointDelta: 2000, note: null, createdAt: isoIn(-11) }],
};
const admin = { id: 1, username: "test-admin", displayName: "ผู้ดูแลระบบทดสอบ", status: "active", roleId: 1, roleCode: "super_admin", roleNameTh: "ผู้ดูแลระบบ", roleNameEn: "Administrator", permissionCodes: [] };
member.sports[0].icon = "🏸";
member.sports[0].description = "สนามแบดมินตัน";
member.sports.push(...[
  { slug: "tennis", name: "เทนนิส", icon: "🎾" },
  { slug: "basketball", name: "บาสเกตบอล", icon: "🏀" },
  { slug: "pickleball", name: "Pickleball", icon: "🥒" },
  { slug: "padel", name: "Padel", icon: "🎯" },
  { slug: "volleyball", name: "วอลเลย์บอล", icon: "🏐" },
].map((sport, index) => ({ ...sport, id: index + 2, requiresBooking: true, baseRate: 300, description: "สนามกีฬา" })));
const paymentFixture = { paymentNo: "PAY-UI-TEST", displayName: "Payment Test", method: "promptpay", amount: 100, status: "created" };
// Dashboard snapshot (lib/admin-dashboard.ts shape): Bangkok dates, 30 days of sales, a waiting payment.
const bangkokDay = (offsetDays) => new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
const dashDays = Array.from({ length: 30 }, (_, index) => {
  const total = index % 6 === 0 ? 0 : 1200 + ((index * 937) % 5200);
  return { day: bangkokDay(index - 29), total, count: total ? 1 + (index % 4) : 0 };
});
const slotAt = (time, minutes = 60) => {
  const start = new Date(`${bangkokDay(0)}T${time}:00+07:00`);
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + minutes * 60000).toISOString() };
};
const dashboardFixture = {
  generatedAt: new Date().toISOString(), today: bangkokDay(0), visitsToday: 18,
  queue: { awaiting: 1, withSlip: 0, oldestSlipMinutes: null, refundsDue: 0, rows: [{ ...paymentFixture, createdAt: isoIn(0) }] },
  sales: {
    today: dashDays.at(-1).total, month: 48200, monthCount: 31, previousToDate: 40000, change: 20.5, cashInMonth: 52000, topupsMonth: 6000, daily: dashDays,
    byCategory: [{ key: "membership", total: 30000, count: 3 }, { key: "coupon", total: 12000, count: 7 }, { key: "booking", total: 6200, count: 21 }],
    byChannel: [{ key: "promptpay", total: 40000, count: 20 }, { key: "cash", total: 12000, count: 6 }],
  },
  schedule: [["07:00", "checked_in", "Court 1"], ["10:00", "paid", "Court 2"], ["13:00", "paid", "Court A ความยาวชื่อสนามทดสอบ"], ["17:00", "pending_payment", "Court 3"], ["19:00", "paid", null], ["21:00", "paid", "Court 4"]]
    .map(([time, status, courtName], index) => ({ bookingNo: `BK-DASH-${index}`, displayName: index === 2 ? "สมาชิกทดสอบที่มีชื่อยาวมากสำหรับตาราง" : `สมาชิก ${index + 1}`, sportName: "แบดมินตัน", courtName, status, ...slotAt(time) })),
  // The day's count comes from its own aggregate: more bookings than the schedule rows listed.
  bookingsToday: { total: 9, checkedIn: 1 },
  courts: { total: 12, available: 11, maintenance: 1 },
  members: { active: 420, newToday: 2, newMonth: 15, withMembership: 180, expiring: [
    { id: 9, displayName: "สมาชิกทดสอบที่ชื่อยาวสำหรับหน้าจอแคบ", memberCode: "PPA-0009", phone: "0811111111", planName: "Fitness 1 เดือน", endsAt: isoIn(2) },
    { id: 10, displayName: "สมาชิกหมดวันนี้", memberCode: "PPA-0010", phone: null, planName: "Fitness 1 เดือน", endsAt: `${bangkokDay(0)}T23:59:00+07:00` },
  ] },
};
// Reports cards: month-to-date SQL figures (lib/report-figures.ts shape).
const reportFigures = {
  period: { from: `${bangkokDay(0).slice(0, 8)}01`, to: bangkokDay(0) },
  finance: { salesMonth: 48200, paymentsMonth: 31, avgBookingValueMonth: 295.24 },
  bookings: { month: 40, paidMonth: 30, pendingNow: 3, cancelledMonth: 6, checkedInMonth: 12, paidRate: 75 },
  members: { total: 420, active: 410, newMonth: 15, checkinsMonth: 380 },
  courts: { total: 12, available: 11, maintenance: 1 },
  coupons: { total: 8, active: 6, soldMonth: 21 },
  trainers: { total: 5, active: 4, avgPrice: 1250 },
  audit: { eventsMonth: 140, sensitiveMonth: 3 },
};
const adminData = { dashboard: dashboardFixture, reportFigures, metrics: ["Members", "Bookings", "Payments", "Revenue"].map((label) => ({ label, value: 125, hint: "Test fixture" })), users: [user], bookings, courts: [{ id: 1, name: "Court A", sportId: 1, sportName: "Badminton", capacity: 4, status: "available", hourlyRate: 200 }], coupons: [], trainers: [trainer], payments: [paymentFixture], staff: [admin], roles: [{ id: 1, code: "super_admin", nameTh: "ผู้ดูแลระบบ", nameEn: "Administrator", level: 100, isSystem: true, permissionCodes: [] }], permissions: [], currentAdmin: admin, auditLogs: [], contentItems: [], systemHealth: [], securityItems: [] };
// Court calendar (Bookings tab): two sports, three courts; on whichever day is asked for, a paid
// member booking, a held walk-in guest booking and a maintenance block.
const calendarCourts = [
  { id: 1, name: "Court A", sportId: 1, sportName: "แบดมินตัน", status: "available", hourlyRate: 200, baseRate: 200, capacity: 4 },
  { id: 2, name: "Court B สนามชื่อยาวสำหรับทดสอบหน้าจอแคบ", sportId: 1, sportName: "แบดมินตัน", status: "available", hourlyRate: 200, baseRate: 200, capacity: 4 },
  { id: 3, name: "Tennis 1", sportId: 2, sportName: "เทนนิส", status: "available", hourlyRate: 400, baseRate: 300, capacity: 4 },
];
const calendarDay = (date) => ({
  date, courts: calendarCourts,
  bookings: [
    { bookingNo: "BK-CAL-1", courtId: 1, startsAt: `${date} 18:00:00`, endsAt: `${date} 20:00:00`, status: "paid", name: "สมาชิกจองประจำ", phone: "0812345678", guest: false, amount: 600, title: "แบดมินตัน - Court A", seriesKey: null, paymentNo: "PAY-CAL-1" },
    { bookingNo: "BK-CAL-2", courtId: 2, startsAt: `${date} 13:00:00`, endsAt: `${date} 14:00:00`, status: "pending_payment", name: "คุณวอล์คอิน", phone: "0899999999", guest: true, amount: 200, title: "แบดมินตัน - Court B", seriesKey: null, paymentNo: null },
  ],
  blocks: [{ id: 4, courtId: 3, startsAt: `${date} 08:00:00`, endsAt: `${date} 11:00:00`, reason: "ซ่อมพื้น" }],
});
// ?nodash renders the console as if the server could not load the first dashboard snapshot.
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PpaApp} from './components/ppa-app'; import {AdminConsole} from './components/admin-console'; import {AdminReceipt} from './components/admin-receipt'; const params=new URLSearchParams(location.search); const tab=params.get('tab')||'dashboard'; const data=${JSON.stringify(adminData)}; if (params.has('nodash')) delete data.dashboard; createRoot(document.getElementById('root')).render(location.pathname.includes('receipt') ? <main className="receipt-page"><AdminReceipt paymentNo="PAY-CAL-1" lang="th"/></main> : location.pathname.includes('admin') ? <AdminConsole adminKey="" data={data} initialTab={tab} initialReportSection={params.get('report') || undefined}/> : <PpaApp/>);`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_REQUIRE_LINE": '"false"', "process.env.NEXT_PUBLIC_LINE_LIFF_ID": '""' },
  plugins: [{ name: "isolated-ui-fixtures", setup(builder) {
    builder.onResolve({ filter: /^(@line\/liff|next\/navigation|next\/image)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "@line/liff"
      ? "export default {init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>null};"
      : args.path === "next/navigation" ? "export const useRouter=()=>({replace:()=>{},refresh:()=>{}});"
      : "import React from 'react'; export default function Image({unoptimized, ...props}) {return <img {...props}/>;}" }));
  } }],
});
// Production React, but the member fixture explicitly opts out of the LINE gate.
const js = bundle.outputFiles[0].text.replace(/const requireLine = .*?;/, "const requireLine = false;");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  // Every check starts without saved member data, except the reopen check (?keepcache=1).
  await context.addInitScript(() => {
    if (!location.search.includes("keepcache")) try { localStorage.removeItem("ppa_member_cache_v1"); } catch { /* blocked storage */ }
  });
  const page = await context.newPage();
  let failBootstrap = false;
  let bootstrapDelayMs = 0;
  let availabilityDelayMs = 0;
  let failAvailability = false;
  let emptyMember = false;
  let consentDue = false;
  const consentRequests = [];
  let promptPayMode = "held";
  let qrMode = "missing";
  const scanRequests = [];
  const paymentRequests = [];
  let failPayment = true;
  let failDashboard = false;
  const rewardRequests = [];
  const bookingRequests = [];
  const calendarRequests = { bookings: [], blocks: [] };
  const topupRequests = [];
  const receiptRequests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__responsive__/**", async (route) => {
    if (route.request().url().endsWith("bundle.js")) return route.fulfill({ contentType: "text/javascript", body: js });
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="th" class="${fontClass}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${/\/__responsive__\/(admin|receipt)/.test(route.request().url()) ? adminStyles : styles}</head><body><div id="root"></div><script src="/__responsive__/bundle.js"></script></body></html>` });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/receipts" && route.request().method() === "POST") {
      receiptRequests.push(route.request().postDataJSON());
      return route.fulfill({ json: { receiptNo: "RC2569-000124", issuedAt: "2026-11-02 18:45:00", firstIssue: true, business: { businessName: "PPA Power Play Sport Club", branch: "สำนักงานใหญ่", address: "99/9 ถนนกีฬา แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10000", taxId: "0105561234567", phone: "02-123-4567", vatRegistered: true, footer: "ขอบคุณที่ใช้บริการ" }, payment: { paymentNo: "PAY-CAL-1", paidAt: "2026-11-02 18:42:00", method: "cash", amount: 300, itemName: "แบดมินตัน - Court A (2 ชั่วโมง เย็นวันจันทร์)" }, customer: { name: "สมาชิกจองประจำ", memberCode: "PPA-0001", phone: "0812345678" }, staffName: "ปวีณา", vat: { net: 280.37, vat: 19.63 } } });
    }
    if (url.pathname === "/api/admin/reports/cashup") return route.fulfill({ json: {
      date: url.searchParams.get("date"),
      cashIn: [{ method: "cash", amount: 1500, count: 4 }, { method: "promptpay", amount: 900, count: 2 }], cashInTotal: 2400,
      walletFunded: { amount: 600, count: 2 },
      byStaff: [{ staffId: 7, staffName: "ปวีณา", method: "cash", amount: 1500, count: 4 }, { staffId: null, staffName: null, method: "promptpay", amount: 900, count: 2 }],
      refunds: [{ paymentNo: "PAY-REFUND-1", amount: 200, refundedAt: new Date().toISOString(), staffName: "ปวีณา", note: "โอนคืนเข้าบัญชีลูกค้าแล้ว" }], refundTotal: 200,
      rows: Array.from({ length: 6 }, (_, index) => ({ paidAt: `${url.searchParams.get("date")} ${String(9 + index).padStart(2, "0")}:15:00`, paymentNo: `PAY-DAY-${index}`, itemName: index % 2 ? "Fitness 1 ครั้ง" : "แบดมินตัน - Court A สนามชื่อยาวสำหรับทดสอบ", customer: index % 2 ? "คุณเอ" : "สมาชิกทดสอบที่มีชื่อยาวมาก", method: index < 4 ? "cash" : "promptpay", amount: index < 4 ? 375 : 450, staffName: index < 4 ? "ปวีณา" : null })),
    } });
    if (url.pathname === "/api/admin/bookings/calendar") return route.fulfill({ json: calendarDay(url.searchParams.get("date")) });
    if (url.pathname === "/api/admin/bookings" && route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      calendarRequests.bookings.push(input);
      const created = Array.from({ length: input.repeatWeeks }, (_, index) => ({ bookingNo: `BK-NEW-${index}`, startsAt: `${input.date} ${input.time}:00`, endsAt: `${input.date} ${input.time}:00`, amount: 200, status: input.payNow ? "paid" : "pending_payment" }));
      return route.fulfill({ status: 201, json: { created, skipped: [], bookings } });
    }
    if (url.pathname === "/api/admin/bookings" && route.request().method() === "GET") return route.fulfill({ json: { bookings } });
    if (url.pathname === "/api/admin/courts/blocks" && route.request().method() === "POST") {
      calendarRequests.blocks.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id: 9 } });
    }
    if (url.pathname === "/api/admin/members") {
      if (route.request().method() === "PUT") return route.fulfill({ json: { ok: true } });
      if (url.searchParams.has("id")) return route.fulfill({ json: { member: { ...user, balance: 2500 }, history: [{ id: 1, amount: 100, kind: "topup", note: "Fixture credit", createdAt: "2026-10-29T01:00:00Z", staffName: "Test admin", balanceBefore: "2400.00", balanceAfter: "2500.00", refType: "admin_credit" }], nextCursor: null } });
      return route.fulfill({ json: { members: [{ ...user, balance: 2500 }], hasMore: false } });
    }
    if (url.pathname === "/api/admin/members/credit") return route.fulfill({ json: { ok: true, balance: "2510.00" } });
    if (url.pathname === "/api/admin/payments") {
      paymentRequests.push(route.request().postDataJSON());
      if (failPayment) return route.fulfill({ status: 409, json: { message: "Payment fixture conflict" } });
      dashboardFixture.queue = { ...dashboardFixture.queue, awaiting: 0, rows: [] };
      return route.fulfill({ json: { payments: [{ ...paymentFixture, status: "paid" }] } });
    }
    if (url.pathname === "/api/admin/dashboard") return failDashboard ? route.fulfill({ status: 503, json: { message: "Service unavailable" } }) : route.fulfill({ json: dashboardFixture });
    if (url.pathname === "/api/rewards/redeem" && route.request().method() === "POST") {
      rewardRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { entitlementId: 702, title: "น้ำเปล่า PPA" } });
    }
    if (url.pathname === "/api/admin/qr/verify") {
      const input = route.request().postDataJSON();
      scanRequests.push(input);
      if (input.token === "invalid") return route.fulfill({ status: 400, json: { message: "QR token ไม่ถูกต้อง" } });
      return route.fulfill({ json: { valid: true, consumed: Boolean(input.consume), qr: { displayName: "Scanner Test", memberCode: "PPA-TEST", purpose: "member", refId: "1" }, ...(input.consume ? {} : { detail: { title: "Fitness (12 เดือน)", expiresAt: "2027-11-02" } }) } });
    }
    if (url.pathname === "/api/wallet/topup" && route.request().method() === "POST") {
      topupRequests.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: "created", paymentNo: "PAY-TOPUP-UI" } });
    }
    if (url.pathname === "/api/courts/availability" && availabilityDelayMs) await new Promise((resolve) => setTimeout(resolve, availabilityDelayMs));
    if (url.pathname === "/api/bootstrap" && bootstrapDelayMs) await new Promise((resolve) => setTimeout(resolve, bootstrapDelayMs));
    if (url.pathname === "/api/bootstrap") return failBootstrap ? route.fulfill({ status: 503, json: { message: "Service unavailable" } }) : route.fulfill({ json: { ...(emptyMember ? { ...member, bookings: [], memberships: [] } : member), ...(consentDue ? { consent: { acceptedAt: null, version: null } } : {}) } });
    if (url.pathname === "/api/payments/promptpay") {
      if (promptPayMode === "expired") return route.fulfill({ status: 409, json: { code: "BOOKING_EXPIRED", message: "หมดเวลาชำระของการจองนี้แล้ว" } });
      return route.fulfill({ json: { paymentNo: url.searchParams.get("paymentNo"), amount: 300, itemName: "Badminton - Court A", qr: fixtureQrPng, payee: { name: "PPA Power Play", account: "••••••5678" }, slipUploadedAt: null, holdSeconds: 600 } });
    }
    if (url.pathname === "/api/payments/slip" && route.request().method() === "POST") return route.fulfill({ json: { ok: true, bookingHeld: true } });
    if (url.pathname === "/api/consent" && route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      consentRequests.push(input);
      return route.fulfill({ json: { acceptedAt: new Date().toISOString(), version: input.version } });
    }
    if (url.pathname === "/api/auth/line" && route.request().method() === "DELETE") return route.fulfill({ json: { ok: true } });
    if (url.pathname === "/api/coupons") return route.fulfill({ json: { coupons: couponStore } });
    if (url.pathname === "/api/groups" && route.request().method() === "GET") return route.fulfill({ json: { groups: member.groups } });
    if (url.pathname === "/api/courts/availability") {
      if (failAvailability) return route.fulfill({ status: 503, json: { message: "Unavailable" } });
      const month = url.searchParams.get("month");
      if (month) {
        const start = new Date(`${month}-01T00:00:00Z`);
        const days = Array.from({ length: 31 }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10)).filter((date) => date.startsWith(month));
        return route.fulfill({ json: { days: days.map((date, index) => ({ date, status: index === days.length - 1 ? "full" : "available", availableSlots: index === days.length - 1 ? 0 : 2 })) } });
      }
      return route.fulfill({ json: { slots: [
        { courtId: 1, courtName: "Court A", time: "08:00", capacity: 4, rate: 200, available: false, status: "past" },
        { courtId: 1, courtName: "Court A", time: "17:00", capacity: 4, rate: 300, available: false, status: "full" },
        { courtId: 1, courtName: "Court A", time: "18:00", capacity: 4, rate: 300, available: true, status: "available" },
      ] } });
    }
    if (url.pathname === "/api/bookings" && route.request().method() === "POST") {
      bookingRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, json: { message: "ช่วงเวลานี้ถูกจองแล้ว" } });
    }
    if (url.pathname === "/api/qr") {
      if (qrMode === "success") return route.fulfill({ json: { svg: fixtureQrSvg, title: "PPA", expiresIn: 30 } });
      return route.fulfill({ status: qrMode === "failure" ? 503 : 404, json: { message: "QR unavailable" } });
    }
    return route.fulfill({ status: 405, json: { message: "Read-only UI fixture" } });
  });
  const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const screen of ["home", "sports", "courts", "mybooking", "trainer", "profile", "scan", "plans", "mycoupons", "coupon", "groups", "gymnos", "wallet", "reward", "help", "visits"]) {
      const entryScreen = { courts: "sports", reward: "home", visits: "membership" }[screen] || screen;
      await page.goto(`${base}/__responsive__/member?screen=${entryScreen}`);
      await page.locator(".phone > .content").waitFor();
      if (screen === "courts") await page.locator('.prototype-list button').first().click();
      if (screen === "reward") {
        await page.locator(".home-bubble.reward").click();
        assert.equal(await page.locator(".coin-reward-list button").count(), 3, "My reward right + 2 catalog rewards");
        assert.equal(await page.locator(".coin-reward-list button.disabled").count(), 1, "Rewards above the coin balance are marked");
      }
      if (screen === "help") {
        assert.match(await page.locator(".menu-item-ui").first().innerText(), /081-111-2222 · 06:00-23:00/, "Help uses the support-contact setting");
        assert.match(await page.locator(".menu-item-ui").filter({ hasText: "นโยบายความเป็นส่วนตัว" }).innerText(), /ยอมรับแล้ว · ฉบับ 2026-11-01/);
      }
      if (screen === "visits") {
        await page.getByRole("button", { name: /การเข้าใช้บริการ/ }).click();
        assert.equal(await page.locator(".visit-row").count(), 2, "Visit history rows");
      }
      if (["mybooking", "profile", "scan"].includes(screen)) await page.locator('.tabbar button').nth({ mybooking: 3, profile: 4, scan: 2 }[screen]).click();
      if (screen === "home") {
        await page.getByRole('heading', { name: 'PPA Sport Complex', exact: true }).waitFor();
        for (const selector of ['.member-card', '.home-carousel', '.live-banner', '.fyg-row', '.quick-booking-row', '.gymnos-banner', '.svc-grid', '.stat-row']) assert.ok(await page.locator(selector).count(), 'Original home section is present: ' + selector);
        assert.equal(await page.locator('.qr-mini-grid').count(), 0, 'Home must not render fake QR patterns');
        assert.equal(await page.getByText('Premium Member', { exact: true }).count(), 0, 'Inactive members must not be labeled premium');
      }
      if (screen === "plans") {
        // Every package tab, with Extra panels open, must fit the viewport.
        for (const tab of ["Time", "Coupon", "ต่ออายุ", "Monthly"]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          for (const toggle of await page.locator(".extra-toggle").all()) await toggle.click();
          if (tab === "ต่ออายุ") {
            await page.locator(".renew-card").waitFor();
            const contentOverflow = await page.locator(".content").evaluate((node) => node.scrollWidth - node.clientWidth);
            assert.ok(contentOverflow <= 1, `plans renew/package ${viewport.width}: ${contentOverflow}`);
            await page.getByRole("tab", { name: "คูปอง", exact: true }).click();
            await page.locator(".renew-card.coupon").waitFor();
          }
          const contentOverflow = await page.locator(".content").evaluate((node) => node.scrollWidth - node.clientWidth);
          assert.ok(contentOverflow <= 1, `plans ${tab} ${viewport.width}: ${contentOverflow}`);
          if (viewport.width === 390) await page.screenshot({ path: `${outDir}/plans-${tab === "ต่ออายุ" ? "renew" : tab.toLowerCase()}-390.png`, fullPage: true });
        }
        assert.equal(await page.locator(".plan-card").count(), 1, "One featured 12-month plan");
        assert.equal(await page.locator(".plan-card .plan-badge").innerText(), "คุ้มสุด");
      }
      if (screen === "home") {
        assert.ok(await page.locator(".fyg-live-pill").count(), "LIVE badge shows while slots are open");
        assert.equal(await page.locator(".fyg-row .fyg-slot:not(.create)").count(), 4, "Find Your Game shows up to 4 open slots and hides full groups");
        assert.match(await page.locator(".fyg-slot .fyg-need").first().innerText(), /ขาดอีก \d+ คน/);
      }
      if (screen === "mycoupons") {
        assert.deepEqual(await page.locator(".cp-card").first().locator(".cp-stats b").allInnerTexts(), ["10", "3", "7"], "Total / used / left");
        assert.match(await page.locator(".cp-card").first().locator(".cp-meta").innerText(), /ซื้อเมื่อ/);
      }
      if (screen === "gymnos") assert.equal(await page.locator(".gx").count() + await page.locator(".promo-hero").count(), 7, "GYMNOS opens 7 blocks");
      if (screen === "mybooking" && viewport.width === 390) {
        await page.locator('.booking-cancel').first().click();
        await page.getByRole('dialog', { name: 'ยกเลิกการจองนี้?' }).waitFor();
        await page.getByRole('button', { name: 'เก็บการจองไว้', exact: true }).click();
        assert.equal(await page.locator('dialog[open]').count(), 0);
      }
      await page.evaluate(() => document.fonts.ready);
      if (screen === "courts") {
        await page.locator('.booking-calendar [data-status="full"]').waitFor();
        assert.ok(await page.locator('.booking-calendar [data-status="full"]').isDisabled());
        await page.locator('.slot-list button:enabled').first().waitFor();
        assert.ok(await page.locator('.slot-list button').filter({ hasText: "ผ่านเวลาแล้ว" }).isDisabled());
        await page.locator('.slot-list button:enabled').first().click();
        await page.locator('.sticky-summary').waitFor();
        await page.getByRole('button', { name: 'เดือนถัดไป', exact: true }).click();
        await page.locator('.booking-calendar [data-status="available"]').first().click();
        assert.equal(await page.locator('.sticky-summary').count(), 0, 'Changing dates must clear the selected court');
        await page.locator('.slot-list button:enabled').first().waitFor();
        if ([320, 390, 768, 1440].includes(viewport.width)) await page.screenshot({ path: `${outDir}/calendar-${viewport.width}.png` });
        if (viewport.width === 390) {
          const date = await page.locator('.booking-calendar [aria-pressed="true"]').getAttribute('data-date');
          await page.locator('.slot-list button:enabled').first().click();
          await page.locator('.sticky-summary .primary').click();
          await page.getByRole('button', { name: /ไปหน้าสรุป/ }).click();
          await page.getByRole('button', { name: /ยืนยันและชำระเงิน/ }).click();
          await page.locator('.booking-calendar').waitFor();
          assert.equal(bookingRequests.at(-1).date, date);
          assert.equal(bookingRequests.at(-1).time, '18:00');
          assert.equal(await page.locator('.sticky-summary').count(), 0, 'Conflict must discard stale selection');
        }
      }
      const metrics = await page.evaluate(() => {
        const content = document.querySelector(".content");
        const phone = document.querySelector(".phone").getBoundingClientRect();
        const nav = document.querySelector(".tabbar").getBoundingClientRect();
        return { docWidth: document.documentElement.scrollWidth, width: innerWidth, docHeight: document.documentElement.scrollHeight, height: innerHeight, contentOverflow: content.scrollWidth - content.clientWidth, phoneBottom: phone.bottom, navBottom: nav.bottom };
      });
      if (metrics.contentOverflow > 1) {
        console.log(await page.locator(".content").evaluate((root) => [...root.querySelectorAll("*")].filter((node) => node.getBoundingClientRect().right > root.getBoundingClientRect().right + 1).slice(0, 35).map((node) => ({ class: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right }))));
        await page.screenshot({ path: `${outDir}/overflow-member.png` });
      }
      assert.ok(metrics.docWidth <= viewport.width + 1 && metrics.docHeight <= viewport.height + 1, JSON.stringify({ screen, viewport, metrics }));
      assert.ok(metrics.contentOverflow <= 1, JSON.stringify({ screen, viewport, metrics }));
      assert.ok(metrics.navBottom <= viewport.height + 1, "Bottom navigation must fit");
      if (screen === "home" && [390, 768, 1440].includes(viewport.width)) {
        await page.screenshot({ path: `${outDir}/member-${viewport.width}.png` });
        await page.locator('.stat-row').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${outDir}/member-home-services-${viewport.width}.png` });
      }
      results.push({ area: "member", screen, viewport, metrics });
    }
    for (const tab of ["dashboard", "members", "bookings", "staff", "roles", "reports", "trainers", "content", "coupons", "audit", "security", "system", "analysis", "scanner"]) {
      await page.goto(`${base}/__responsive__/admin?tab=${tab}`);
      await page.locator(".admin-main").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const main = document.querySelector(".admin-main");
        return { docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, mainOverflow: main.scrollWidth - main.clientWidth };
      });
      assert.ok(metrics.docWidth <= viewport.width + 1 && metrics.docHeight <= viewport.height + 1 && metrics.mainOverflow <= 1, JSON.stringify({ tab, viewport, metrics }));
        if (tab === "members") {
        await page.getByRole("button", { name: "ข้อมูล / เครดิต / ประวัติ", exact: true }).first().click();
        await page.locator("h2").nth(1).waitFor();
        await page.getByLabel("ชื่อสมาชิก", { exact: true }).fill("สมาชิกแก้ไขแล้ว");
        await page.getByRole("button", { name: "บันทึกข้อมูลสมาชิก", exact: true }).click();
        await page.getByText("บันทึกข้อมูลสมาชิกแล้ว", { exact: true }).waitFor();
        await page.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("10");
        await page.getByLabel("เหตุผลการปรับเครดิต", { exact: true }).fill("ทดสอบปรับเครดิต");
        await page.getByRole("button", { name: "ยืนยันปรับเครดิต", exact: true }).click();
        await page.getByText("บันทึกการปรับเครดิตแล้ว", { exact: true }).waitFor();
        await page.getByText("ประวัติเพิ่ม–ลดเครดิต", { exact: true }).waitFor();
        await page.getByRole("button", { name: "ปิด", exact: true }).click();
      }
      if (tab === "dashboard") {
        assert.equal(await page.locator(".dash-action").filter({ hasText: "รอชำระ ยังไม่ส่งสลิป" }).locator("strong").innerText(), "1", "action list counts the waiting payment");
        assert.equal(await page.locator(".dash-chart-bars button").count(), 30, "30 days of sales");
        assert.equal(await page.locator(".dash-slot").count(), 6, "today's court schedule");
        const bookingsFigure = await page.locator(".dash-figures div").filter({ hasText: "การจองวันนี้" }).locator("dd").innerText();
        assert.match(bookingsFigure, /^9\s*เข้าใช้แล้ว 1$/, `the day's bookings come from the day's count, not the listed rows: ${bookingsFigure}`);
        assert.equal(await page.locator(".dash-chart-tooltip").getAttribute("aria-live"), null, "the focused bar's label is announced once, not again by a live tooltip");
        assert.equal(await page.locator(".dash-chart-tooltip").getAttribute("aria-hidden"), "true");
        assert.match(await page.locator(".dash-people li").filter({ hasText: "สมาชิกหมดวันนี้" }).innerText(), /วันนี้/, "a package ending later today says today, not in 1 day");
        assert.match(await page.locator(".dash-people li").filter({ hasText: "PPA-0009" }).innerText(), /อีก 2 วัน/);
        assert.match(await page.locator(".dash-figures dd").filter({ hasText: "48,200" }).innerText(), /\+20\.5%/, "month sales carry the comparison");
        if (viewport.width === 1440) {
          const lastBar = page.locator(".dash-chart-bars button").last();
          await lastBar.focus();
          await page.keyboard.press("ArrowLeft");
          assert.equal(await page.locator(".dash-chart-bars button").nth(28).evaluate((node) => node === document.activeElement), true, "arrow keys move between days");
          await page.getByRole("button", { name: "ดูเป็นตาราง", exact: true }).click();
          assert.equal(await page.locator(".dash-chart-table tbody tr").count(), 30, "table view of the chart");
          await page.getByRole("button", { name: "ดูเป็นกราฟ", exact: true }).click();
        }
        if (viewport.width < 1024) {
          await page.getByRole("button", { name: "Open menu", exact: true }).click();
          await page.getByRole("dialog", { name: "Admin navigation" }).waitFor();
          await page.keyboard.press("Escape");
          assert.equal(await page.locator(".admin-console").getAttribute("data-menu-open"), "false");
        }
        if ([390, 768, 1440].includes(viewport.width)) await page.screenshot({ path: `${outDir}/admin-${viewport.width}.png` });
        if ([390, 1440].includes(viewport.width)) await page.locator(".dash-panel").filter({ has: page.locator("#dash-today") }).screenshot({ path: `${outDir}/admin-today-${viewport.width}.png` });
        // Account menu (native popover): profile, language, theme and sign-out live here.
        assert.equal(await page.locator(".admin-console").getAttribute("data-theme"), "light", "light theme by default");
        await page.locator(".admin-user-trigger").click();
        const userMenu = page.locator(".admin-user-menu:popover-open");
        await userMenu.waitFor();
        const menuBox = await userMenu.boundingBox();
        assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= viewport.width + 1 && menuBox.y + menuBox.height <= viewport.height + 1, `account menu fits ${viewport.width}x${viewport.height}`);
        // Focus moves in on the popover's toggle event (a task after the click), so wait for it.
        await page.waitForFunction(() => Boolean(document.activeElement?.closest(".admin-user-menu")), null, { timeout: 2000 });
        await page.getByRole("button", { name: "แก้ไขโปรไฟล์และรหัสผ่าน", exact: true }).click();
        const dialog = page.locator("dialog[open]");
        await dialog.waitFor();
        for (let i = 0; i < 18; i++) {
          await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest("dialog[open]"))), true, "Dialog must trap keyboard focus");
        }
        const dialogBox = await dialog.locator(".admin-modal").boundingBox();
        assert.ok(dialogBox.x >= 0 && dialogBox.y >= 0 && dialogBox.x + dialogBox.width <= viewport.width + 1 && dialogBox.y + dialogBox.height <= viewport.height + 1, "Dialog must stay inside viewport");
        await dialog.locator(".admin-profile-modal-actions button").last().scrollIntoViewIfNeeded();
        if (viewport.width === 390) await page.screenshot({ path: `${outDir}/profile-mobile.png` });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        await page.locator(".admin-user-trigger").click();
        await userMenu.waitFor();
        await userMenu.getByRole("button", { name: "มืด", exact: true }).click();
        assert.equal(await page.locator(".admin-console").getAttribute("data-theme"), "dark");
        assert.match(await page.evaluate(() => document.cookie), /ppa_admin_theme=dark/, "the theme choice is remembered for the next visit");
        await page.keyboard.press("Escape");
        await userMenu.waitFor({ state: "detached" }).catch(() => {});
        assert.equal(await page.locator(".admin-user-menu:popover-open").count(), 0, "Esc closes the account menu");
        if (viewport.width === 390) await page.screenshot({ path: `${outDir}/admin-dark-mobile.png` });
        await page.locator(".admin-user-trigger").click();
        await userMenu.getByRole("button", { name: "สว่าง", exact: true }).click();
        assert.equal(await page.locator(".admin-console").getAttribute("data-theme"), "light");
        await page.keyboard.press("Escape");
        await page.evaluate(() => { document.cookie = "ppa_admin_theme=; path=/; max-age=0"; });
      }
      if (tab === "bookings") {
        // Court calendar: one timeline row per court, 08:00-23:00 in hour columns, status in text.
        await page.locator(".cal-row").first().waitFor();
        assert.equal(await page.locator(".cal-row").count(), 3, "one timeline row per court");
        assert.equal(await page.locator(".cal-head .cal-hour").count(), 15, "08:00-23:00 in 15 hour columns");
        for (const row of await page.locator(".cal-row").all()) {
          assert.equal(await row.evaluate((node) => [...node.querySelectorAll("[data-hours]")].reduce((sum, cell) => sum + Number(cell.dataset.hours), 0)), 15, "each court row covers the 15 opening hours");
        }
        assert.match(await page.locator(".cal-event").filter({ hasText: "คุณวอล์คอิน" }).innerText(), /รอชำระ/, "a held guest booking shows the guest name and its status in words");
        assert.match(await page.locator(".cal-event").filter({ hasText: "สมาชิกจองประจำ" }).innerText(), /ชำระแล้ว/);
        assert.match(await page.locator(".cal-block").innerText(), /ซ่อมพื้น/);
        const calendarFit = await page.evaluate(() => ({ docWidth: document.documentElement.scrollWidth, mainOverflow: document.querySelector(".admin-main").scrollWidth - document.querySelector(".admin-main").clientWidth }));
        assert.ok(calendarFit.docWidth <= viewport.width + 1 && calendarFit.mainOverflow <= 1, `calendar fits ${viewport.width}: ${JSON.stringify(calendarFit)}`);
        if ([390, 1440].includes(viewport.width)) await page.locator(".cal-panel").screenshot({ path: `${outDir}/calendar-admin-${viewport.width}.png` });
        if (viewport.width === 1440) {
          // Tomorrow: every hour is still ahead, whatever time the check runs.
          await page.getByRole("button", { name: "วันถัดไป", exact: true }).click();
          await page.getByRole("button", { name: "ว่าง 10:00 Court A, จอง", exact: true }).click();
          const bookingDialog = page.getByRole("dialog", { name: "จองสนาม" });
          await bookingDialog.waitFor();
          await bookingDialog.getByRole("button", { name: "ลูกค้าทั่วไป", exact: true }).click();
          await bookingDialog.getByLabel("ชื่อลูกค้า", { exact: true }).fill("คุณทดสอบ");
          await bookingDialog.getByLabel("เบอร์โทร", { exact: true }).fill("081-234-5678");
          // Selects by role + name: an exact getByLabel compares the whole <label> text, option texts included.
          await bookingDialog.getByRole("combobox", { name: "จองซ้ำทุกสัปดาห์", exact: true }).selectOption("4");
          await bookingDialog.getByRole("button", { name: "ชำระตอนนี้", exact: true }).click();
          await bookingDialog.getByRole("combobox", { name: "ช่องทางชำระ", exact: true }).selectOption("cash");
          await page.screenshot({ path: `${outDir}/calendar-booking-dialog-1440.png` });
          await bookingDialog.getByRole("button", { name: /^บันทึกและรับชำระ/ }).click();
          await page.getByText(/จองแล้ว 4 รายการ/).waitFor();
          const sent = calendarRequests.bookings.at(-1);
          assert.match(sent.requestId, /^[A-Za-z0-9-]{8,64}$/);
          assert.deepEqual({ ...sent, requestId: "-" }, { courtId: 1, date: bangkokDay(1), time: "10:00", durationHours: 1, players: 2, customer: { kind: "guest", name: "คุณทดสอบ", phone: "081-234-5678" }, repeatWeeks: 4, payNow: { method: "cash" }, requestId: "-" });
          await page.getByRole("button", { name: "บล็อกสนาม", exact: true }).click();
          const blockDialog = page.getByRole("dialog", { name: "บล็อกสนาม" });
          await blockDialog.waitFor();
          await blockDialog.getByRole("combobox", { name: "สนาม", exact: true }).selectOption("3");
          await blockDialog.getByRole("combobox", { name: "ตั้งแต่", exact: true }).selectOption("19:00");
          await blockDialog.getByRole("combobox", { name: "ถึง", exact: true }).selectOption("21:00");
          await blockDialog.getByLabel("เหตุผล", { exact: true }).fill("จัดแข่งขัน");
          await blockDialog.getByRole("button", { name: "บันทึกการบล็อก", exact: true }).click();
          await page.getByText("บล็อกสนามแล้ว", { exact: true }).waitFor();
          assert.deepEqual(calendarRequests.blocks.at(-1), { courtId: 3, date: bangkokDay(1), from: "19:00", to: "21:00", reason: "จัดแข่งขัน" });
        }
      }
      results.push({ area: "admin", tab, viewport, metrics });
    }
    console.log(`PASS layout ${viewport.width}x${viewport.height}`);
  }
  failAvailability = true;
  await page.goto(`${base}/__responsive__/member?screen=sports`);
  await page.locator('.prototype-list button').first().click();
  await page.getByText('โหลดปฏิทินไม่สำเร็จ').waitFor();
  assert.equal(await page.locator('.booking-calendar-grid button:enabled').count(), 0, 'Network failure must not expose bookable dates');
  failAvailability = false;
  await page.locator('.booking-calendar').getByRole('button', { name: 'ลองใหม่' }).click();
  await page.locator('.booking-calendar [data-status="available"]').first().waitFor();
  emptyMember = true;
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.locator('.empty').filter({ hasText: 'ยังไม่มีนัดหมายที่กำลังจะมาถึง' }).waitFor();
  await page.locator('.tabbar button').nth(3).click();
  await page.getByText('ยังไม่มีรายการจองที่กำลังจะมาถึง', { exact: true }).waitFor();
  assert.equal(await page.locator('.booking-row-ui').count(), 0, 'Empty accounts must not see demo bookings');
  await page.locator('.tabbar button').nth(4).click();
  await page.getByRole('button', { name: /ออกจากระบบ/ }).click();
  await page.getByRole('dialog', { name: 'ออกจากระบบ?' }).getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
  await page.locator('.line-gate').waitFor();
  assert.equal(await page.locator('.status-member-chip').count(), 0, 'Logout must remove member data from screen');
  emptyMember = false;
  await page.goto(`${base}/__responsive__/member?screen=classschedule`);
  await page.getByText('ยังไม่มีตารางคลาสเปิดให้จอง').waitFor();
  assert.equal(await page.locator('.chip-grid button').count(), 0, 'Missing schedules must not generate fake time slots');
  member.contentItems = [{ id: 99, contentType: 'class_schedule', title: 'Full class fixture', subtitle: '10:00', icon: '', price: 200, metadata: { status: 'full', time: '10:00' } }];
  await page.reload();
  await page.locator('.chip-grid button').waitFor();
  assert.equal(await page.locator('.chip-grid button').count(), 1);
  assert.ok(await page.locator('.chip-grid button').isDisabled(), 'A fully booked schedule must not fall back to generated availability');
  member.contentItems = [];
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.locator('.home-carousel').waitFor();
  assert.equal(await page.locator('.home-carousel .ad-slide').count(), 4);
  await page.getByRole('button', { name: 'สไลด์ถัดไป', exact: true }).click();
  assert.equal(await page.locator('.ad-dots button[aria-current="true"]').getAttribute('aria-label'), 'ดูสไลด์ 2');
  await page.getByRole('button', { name: 'สไลด์ก่อนหน้า', exact: true }).click();
  assert.equal(await page.locator('.ad-dots button[aria-current="true"]').getAttribute('aria-label'), 'ดูสไลด์ 1');
  await page.getByRole('button', { name: 'ดูสไลด์ 3', exact: true }).click();
  await page.locator('.ad-slide[aria-hidden="false"]').click();
  await page.getByRole('tab', { name: 'ซื้อคูปอง', exact: true }).waitFor();
  assert.equal(await page.locator('.home-carousel').count(), 0, 'Coupon slide navigates away from home');
  member.contentItems = [{ id: 101, contentType: 'home_slide', slug: 'managed-slide', title: 'Managed slide fixture', subtitle: 'Managed content', icon: '', price: 0, targetScreen: 'wallet', metadata: { tone: 'shop' } }];
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.getByText('Managed slide fixture', { exact: true }).waitFor();
  assert.equal(await page.locator('.ad-slide').count(), 1, 'Configured slides replace default slides');
  assert.equal(await page.locator('.home-slide-controls').count(), 0, 'Single slide has no unnecessary controls');
  await page.locator('.ad-slide').click();
  await page.locator('.wallet-actions').waitFor();
  member.contentItems = [];
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.getByRole('button', { name: 'หยุดสไลด์', exact: true }).waitFor();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => document.querySelector('.ad-dots button[aria-current="true"]')?.getAttribute('aria-label') === 'ดูสไลด์ 2', undefined, { timeout: 7000 });
  await page.getByRole('button', { name: 'หยุดสไลด์', exact: true }).click();
  await page.getByRole('button', { name: 'เล่นสไลด์', exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'เล่นสไลด์', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'เล่นสไลด์', exact: true }).count(), 0, 'Reduced motion disables autoplay');
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.locator('.tabbar button').nth(2).click();
  await page.locator('.qr-error-state').filter({ hasText: 'ไม่พบแพ็กเกจสมาชิก' }).waitFor();
  qrMode = "failure";
  await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
  await page.locator('.qr-error-state').filter({ hasText: 'เชื่อมต่อบริการ QR ไม่สำเร็จ' }).waitFor();
  qrMode = "success";
  await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
  await page.locator('.qr-svg').waitFor();
  await page.waitForFunction(() => document.querySelector('.qr-svg')?.naturalWidth > 0);
  assert.equal(await page.locator('.qr-error-state').count(), 0);
  await page.screenshot({ path: `${outDir}/qr-retry-success.png` });
  qrMode = "missing";
  // PDPA consent appears only while the published policy version is not accepted, and fits small screens.
  // (Earlier checks replaced the content fixture; the settings stay for the translated-screen pass.)
  member.contentItems = [...launchContent];
  for (const viewport of [viewports[0], viewports[1], viewports[6]]) {
    await page.setViewportSize(viewport);
    consentDue = true;
    await page.goto(`${base}/__responsive__/member?screen=home`);
    await page.getByRole("dialog", { name: /นโยบายความเป็นส่วนตัว/ }).waitFor();
    assert.equal(await page.locator("dialog.consent-dialog").evaluate((node) => node.matches(":modal")), true, "consent is a modal dialog (focus trapped, app inert)");
    // Chrome closes a dialog on a repeated Esc even when cancel is prevented: required consent must come back as a modal.
    for (let press = 0; press < 3; press++) await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("dialog.consent-dialog")?.matches(":modal"), null, { timeout: 3000 });
    assert.equal(await page.locator("dialog.consent-dialog").evaluate((node) => node.open), true, "Esc does not dismiss required consent");
    assert.ok(await page.locator(".consent-contact a").count() >= 2, "club contact reachable from the dialog");
    const card = await page.locator(".consent-card").boundingBox();
    const accept = await page.getByRole("button", { name: "ยอมรับและใช้งานต่อ", exact: true }).boundingBox();
    assert.ok(card.y >= 0 && card.y + card.height <= viewport.height + 1 && card.x >= 0 && card.x + card.width <= viewport.width + 1, `consent card fits ${viewport.width}x${viewport.height}: ${JSON.stringify(card)}`);
    assert.ok(accept.y + accept.height <= card.y + card.height + 1, `accept button reachable ${viewport.width}x${viewport.height}`);
    if (viewport.width === 390) await page.screenshot({ path: `${outDir}/consent-390.png` });
    await page.getByRole("button", { name: "ยอมรับและใช้งานต่อ", exact: true }).click();
    await page.locator(".consent-card").waitFor({ state: "detached" });
    assert.equal(consentRequests.at(-1).version, "2026-11-01");
    consentDue = false;
  }
  // A redeemed reward opens its QR even when reloading the member data fails right after
  // (an error there used to hide the QR and invite a second redemption).
  await page.setViewportSize(viewports[1]);
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.locator(".home-bubble.reward").click();
  failBootstrap = true;
  await page.locator(".coin-reward-list").last().locator("button").first().click();
  await page.getByRole("dialog", { name: "แลกรางวัลนี้?" }).getByRole("button", { name: "แลกรางวัล", exact: true }).click();
  await page.locator(".scan-title").waitFor({ timeout: 5000 });
  failBootstrap = false;
  assert.deepEqual(rewardRequests.map((input) => input.contentId), [501], "one redemption for the reward tapped");
  // Court booking paid by PromptPay: the deadline is shown while the court is held; once it lapses
  // there is no QR, only the late-slip option. A sent slip says the court is reserved.
  member.pendingPayments = [{ paymentNo: "PAYBOOKUI01", amount: 300, createdAt: isoIn(0), slipUploadedAt: null, itemType: "booking", itemName: "Badminton - Court A", refId: null }];
  for (const viewport of [viewports[0], viewports[1]]) {
    await page.setViewportSize(viewport);
    for (const mode of ["held", "expired"]) {
      promptPayMode = mode;
      await page.goto(`${base}/__responsive__/member?screen=wallet`);
      await page.getByRole("button", { name: "ชำระ / แนบสลิป", exact: true }).click();
      if (mode === "held") {
        await page.locator(".pay-qr-image").waitFor();
        assert.match(await page.locator(".pay-deadline").innerText(), /ชำระและแนบสลิปภายใน \d{2}:\d{2} น\./);
        if (viewport.width === 390) await page.screenshot({ path: `${outDir}/promptpay-booking-390.png`, fullPage: true });
      } else {
        await page.getByText("หมดเวลาชำระของการจองนี้แล้ว", { exact: true }).waitFor();
        assert.equal(await page.locator(".pay-qr-image").count(), 0, "No QR once the hold has lapsed");
      }
      await page.locator(".slip-upload input").setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: Buffer.from(fixtureQrPng.split(",")[1], "base64") });
      await page.getByText("ส่งสลิปแล้ว สนามถูกกันไว้ให้จนกว่าเจ้าหน้าที่จะยืนยัน", { exact: true }).waitFor();
      assert.equal(await page.locator(".pay-deadline").count(), 0, "Deadline hidden after the slip is sent");
      const overflow = await page.locator(".content").evaluate((node) => node.scrollWidth - node.clientWidth);
      assert.ok(overflow <= 1, `promptpay ${mode} ${viewport.width}: ${overflow}`);
    }
  }
  member.pendingPayments = [];
  promptPayMode = "held";
  const translatedScreens = ["home", "sports", "courts", "datetime", "summary", "payment", "mybooking", "profile", "membership", "wallet", "coupon", "trainer", "trainer-detail", "help", "notifications", "classhub", "classschedule", "livetv", "promotion", "scan", "plans", "mycoupons", "groups", "gymnos"];
  for (const viewport of [viewports[0], viewports[2], viewports[4]]) {
    await page.setViewportSize(viewport);
    for (const locale of ["th", "en", "zh"]) {
      await page.goto(`${base}/__responsive__/member?screen=home`);
      await page.locator('.language-switcher select').selectOption(locale);
      const htmlLang = locale === "zh" ? "zh-CN" : locale;
      await page.waitForFunction((value) => document.documentElement.lang === value, htmlLang);
      for (const screen of translatedScreens) {
        const entryScreen = ["courts", "datetime", "summary"].includes(screen) ? "sports" : screen === "payment" ? "wallet" : screen === "trainer-detail" ? "trainer" : ["mybooking", "profile", "notifications", "scan"].includes(screen) ? "home" : screen;
        await page.goto(`${base}/__responsive__/member?screen=${entryScreen}`);
        await page.locator('.phone > .content').waitFor();
        await page.waitForFunction((value) => document.documentElement.lang === value, htmlLang);
        assert.equal(await page.locator('.language-switcher select').inputValue(), locale, "Language must persist after navigation/reload");
        if (["mybooking", "profile", "scan"].includes(screen)) await page.locator('.tabbar button').nth({ mybooking: 3, profile: 4, scan: 2 }[screen]).click();
        if (screen === "notifications") await page.locator('.club-icon-button').click();
        if (screen === "trainer-detail") await page.locator('.trainer-list-card').first().click();
        if (screen === "payment") await page.locator('.wallet-actions button').click();
        if (["courts", "datetime", "summary"].includes(screen)) {
          await page.locator('.prototype-list button').first().click();
          await page.locator('.booking-calendar [data-status="full"]').waitFor();
          assert.ok(await page.locator('.booking-calendar [data-status="full"]').isDisabled());
          if (screen !== "courts") {
            await page.locator('.slot-list button:enabled').first().click();
            await page.locator('.sticky-summary .primary').click();
            if (screen === "summary") await page.locator('.page > .primary').click();
          }
        }
        const contentText = await page.locator('.content').evaluate((root) => {
          const copy = root.cloneNode(true);
          copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
          return copy.textContent || "";
        });
        // Member-entered names, booking titles and ledger notes are stored text, not interface copy.
        if (locale !== "th") assert.doesNotMatch(contentText.replaceAll(user.displayName, "").replaceAll(bookings[0].title, "").replaceAll(ledgerNote, "").replaceAll("฿", ""), /[\u0e00-\u0e7f]/, `${locale} ${screen}: untranslated interface text`);
        const metrics = await page.evaluate(() => ({ documentOverflow: document.documentElement.scrollWidth - innerWidth, contentOverflow: document.querySelector('.content').scrollWidth - document.querySelector('.content').clientWidth }));
        assert.ok(metrics.documentOverflow <= 1 && metrics.contentOverflow <= 1, `${locale} ${screen} ${viewport.width}: ${JSON.stringify(metrics)}`);
        if (["home", "courts", "payment", "trainer-detail"].includes(screen)) await page.screenshot({ path: `${outDir}/i18n-${locale}-${screen}-${viewport.width}.png` });
        results.push({ area: "i18n", screen, locale, viewport, metrics });
      }
    }
  }
  // Switching language mid-booking must preserve the selected court and date.
  await page.goto(`${base}/__responsive__/member?screen=sports`);
  await page.locator('.prototype-list button').first().click();
  await page.locator('.slot-list button:enabled').first().click();
  const selectedDay = await page.locator('.booking-calendar [aria-pressed="true"]').getAttribute('data-date');
  for (const locale of ["en", "zh", "th"]) {
    await page.locator('.language-switcher select').selectOption(locale);
    await page.locator('.sticky-summary').waitFor();
    assert.equal(await page.locator('.booking-calendar [aria-pressed="true"]').getAttribute('data-date'), selectedDay);
    assert.equal(await page.locator('.slot-list button.on').count(), 1);
  }
  await page.goto(`${base}/__responsive__/admin?tab=scanner`);
  await page.getByLabel("QR URL หรือรหัสจากเครื่องอ่าน").fill("invalid");
  await page.getByRole("button", { name: "ตรวจสอบ QR", exact: true }).click();
  await page.getByText("QR token ไม่ถูกต้อง", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "ยืนยันเข้าใช้บริการ", exact: true }).count(), 0);
  await page.getByLabel("QR URL หรือรหัสจากเครื่องอ่าน").fill("a".repeat(43));
  await page.getByRole("button", { name: "ตรวจสอบ QR", exact: true }).click();
  await page.getByText("Scanner Test", { exact: true }).waitFor();
  assert.equal(scanRequests.at(-1).consume, false);
  assert.match(await page.locator(".qr-scanner-result").innerText(), /แพ็กเกจสมาชิก[\s\S]*Fitness \(12 เดือน\)[\s\S]*ใช้ได้ถึง 2027-11-02/, "staff see what the QR grants before confirming");
  await page.getByRole("button", { name: "ยืนยันเข้าใช้บริการ", exact: true }).click();
  await page.getByText("บันทึกการใช้สิทธิ์เรียบร้อยแล้ว", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("QR URL หรือรหัสจากเครื่องอ่าน").inputValue(), "", "the field is empty for the next scan");
  assert.equal(scanRequests.filter((request) => request.consume).length, 1);
  assert.equal(await page.getByRole("button", { name: "ยืนยันเข้าใช้บริการ", exact: true }).count(), 0);
  await page.screenshot({ path: `${outDir}/scanner-success.png` });
  await page.getByRole("button", { name: "เปิดกล้องสแกน", exact: true }).click();
  await page.getByText(/เปิดกล้องไม่ได้/).waitFor();
  // Feed generated QR pixels through a video MediaStream and the actual camera loop.
  await page.evaluate(async (svg) => {
    const image = new Image();
    image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 660; canvas.height = 660;
    const context = canvas.getContext("2d");
    context.fillStyle = "#0a0a0c";
    context.fillRect(0, 0, 660, 660);
    context.fillStyle = "#ffffff";
    context.fillRect(170, 170, 320, 320);
    context.drawImage(image, 190, 190, 280, 280);
    const media = canvas.captureStream(10);
    window.__scannerTestStream = media;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => media });
  }, await QRCode.toString(`https://example.invalid/q/${"b".repeat(43)}`, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" }));
  await page.getByRole("button", { name: "เปิดกล้องสแกน", exact: true }).click();
  await page.getByText("Scanner Test", { exact: true }).waitFor();
  assert.ok(scanRequests.at(-1).token.endsWith("b".repeat(43)), "Camera must decode the generated QR frame");
  assert.equal(scanRequests.at(-1).consume, false, "Camera scan only previews the right");
  assert.equal(await page.evaluate(() => window.__scannerTestStream.getTracks().every((track) => track.readyState === "ended")), true, "Camera stops after detection");
  // A member QR opened from a phone camera lands on the scanner with ?token=: checked at once.
  await page.goto(`${base}/__responsive__/admin?tab=scanner&token=${"c".repeat(43)}`);
  await page.getByText("Scanner Test", { exact: true }).waitFor();
  assert.equal(scanRequests.at(-1).token, "c".repeat(43));
  assert.equal(scanRequests.at(-1).consume, false, "opening the address only previews");
  assert.doesNotMatch(page.url(), /token=/, "the code leaves the address, so a reload does not check it again");
  await page.screenshot({ path: `${outDir}/scanner-preview.png` });
  await page.goto(`${base}/__responsive__/admin?tab=dashboard`);
  const approvePayment = page.getByRole("button", { name: "ยืนยันชำระ", exact: true });
  await approvePayment.waitFor();
  assert.equal(await page.getByRole("button", { name: "ยกเลิกรายการ", exact: true }).count(), 1, "Staff can cancel an unpaid request");
  await page.getByRole("button", { name: "ยกเลิกรายการ", exact: true }).click();
  await page.getByLabel("เหตุผลที่ยกเลิก (แจ้งสมาชิก)").waitFor();
  assert.equal(await page.getByRole("button", { name: "ยืนยันยกเลิกรายการ", exact: true }).count(), 1, "Cancelling asks for a reason first");
  // "อื่นๆ" needs a written reason: spaces alone are not sent to the member as the reason.
  await page.getByLabel("เหตุผลที่ยกเลิก (แจ้งสมาชิก)").selectOption("อื่นๆ");
  await page.getByLabel("ระบุเหตุผล", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "ยืนยันยกเลิกรายการ", exact: true }).click();
  assert.equal(paymentRequests.length, 0, "a blank written reason is not submitted");
  await page.getByRole("button", { name: "กลับ", exact: true }).click();
  assert.equal(await approvePayment.isEnabled(), true, "Session-authenticated staff need no legacy admin key");
  await approvePayment.click();
  await page.getByText("Payment fixture conflict", { exact: true }).waitFor();
  assert.equal(await approvePayment.isEnabled(), true, "Failed approval remains retryable");
  failPayment = false;
  await approvePayment.click();
  await page.getByText("อัปเดต payment แล้ว", { exact: true }).waitFor();
  assert.equal(await approvePayment.count(), 0, "A confirmed payment leaves the queue and cannot be approved again");
  await page.locator(".dash-action").filter({ hasText: "รอชำระ ยังไม่ส่งสลิป" }).locator("strong").filter({ hasText: /^0$/ }).waitFor();
  assert.deepEqual(paymentRequests, [1, 2].map(() => ({ paymentNo: "PAY-UI-TEST", status: "paid" })));
  await page.screenshot({ path: `${outDir}/payment-confirmation.png` });
  // No first snapshot (the server could not load it): the dashboard loads at once and offers a retry,
  // instead of claiming to show "the latest figures" with nothing on screen.
  failDashboard = true;
  await page.goto(`${base}/__responsive__/admin?tab=dashboard&nodash=1`);
  await page.getByText("โหลดภาพรวมไม่สำเร็จ", { exact: true }).waitFor({ timeout: 5000 });
  failDashboard = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await page.locator(".dash-chart-bars button").first().waitFor({ timeout: 5000 });
  // Printable receipt: abbreviated tax invoice with the VAT inside the price, one request per view.
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${base}/__responsive__/receipt`);
    const paper = page.locator(".receipt-paper");
    await paper.waitFor();
    assert.match(await paper.innerText(), /ใบเสร็จรับเงิน\/ใบกำกับภาษีอย่างย่อ[\s\S]*RC2569-000124[\s\S]*280\.37[\s\S]*19\.63[\s\S]*300\.00/);
    const fit = await page.evaluate(() => ({ docWidth: document.documentElement.scrollWidth, paper: document.querySelector(".receipt-paper").getBoundingClientRect().right }));
    assert.ok(fit.docWidth <= viewport.width + 1 && fit.paper <= viewport.width, `receipt fits ${viewport.width}: ${JSON.stringify(fit)}`);
    await page.screenshot({ path: `${outDir}/receipt-${viewport.width}.png` });
  }
  assert.deepEqual(receiptRequests.at(-1), { paymentNo: "PAY-CAL-1" });
  // Daily cash-up: drawer cash first, totals by channel and staff, print shows only the sheet.
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${base}/__responsive__/admin?tab=reports&report=cashup`);
    await page.locator(".cashup-figures").waitFor();
    assert.match(await page.locator(".cashup-figures .lead").innerText(), /เงินสดรับเข้า[\s\S]*1,500\.00/);
    assert.match(await page.locator(".cashup-figures").innerText(), /2,400\.00[\s\S]*600\.00[\s\S]*200\.00/);
    assert.match(await page.locator(".cashup-block").filter({ hasText: "แยกตามพนักงานที่รับเงิน" }).innerText(), /ปวีณา[\s\S]*ไม่ระบุผู้รับ/);
    assert.equal(await page.getByRole("button", { name: "พิมพ์", exact: true }).isEnabled(), true);
    const fit = await page.evaluate(() => ({ docWidth: document.documentElement.scrollWidth, mainOverflow: document.querySelector(".admin-main").scrollWidth - document.querySelector(".admin-main").clientWidth }));
    assert.ok(fit.docWidth <= viewport.width + 1 && fit.mainOverflow <= 1, `cash-up fits ${viewport.width}: ${JSON.stringify(fit)}`);
    await page.screenshot({ path: `${outDir}/cashup-${viewport.width}.png`, fullPage: true });
  }
  // Report cards state their period; report lists state how many recent rows they hold.
  await page.goto(`${base}/__responsive__/admin?tab=reports&report=bookings`);
  await page.locator(".report-card").first().waitFor();
  assert.deepEqual(await page.locator(".report-card").evaluateAll((cards) => cards.map((card) => [card.querySelector("b").textContent, card.querySelector("small").textContent])), [["40", await page.locator(".report-card small").first().textContent()], ["75%", await page.locator(".report-card small").nth(1).textContent()], ["3", "ตอนนี้"], ["6", await page.locator(".report-card small").nth(3).textContent()]]);
  assert.match(await page.locator(".report-card small").first().textContent(), /^เดือนนี้ \d/);
  assert.match(await page.locator(".admin-report-summary article").first().innerText(), /ข้อมูล 12 รายการล่าสุด ตั้งแต่ 10 ธ\.ค\. 2569/);
  await page.screenshot({ path: `${outDir}/report-bookings-1440.png` });
  await page.goto(`${base}/__responsive__/admin?tab=reports&report=cashup`);
  await page.locator(".cashup-figures").waitFor();
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".admin-sidebar").isVisible(), false, "print leaves out the console navigation");
  assert.equal(await page.locator(".cashup-tools").isVisible(), false);
  assert.equal(await page.locator(".cashup-sign").isVisible(), true, "the printed sheet ends with signature lines");
  await page.screenshot({ path: `${outDir}/cashup-print.png`, fullPage: true });
  await page.emulateMedia({ media: "screen" });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".receipt-toolbar").isVisible(), false, "print hides the toolbar");
  await page.screenshot({ path: `${outDir}/receipt-print.png` });
  await page.emulateMedia({ media: "screen" });
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 360 });
  failBootstrap = true;
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.getByRole("heading", { name: "โหลดข้อมูลไม่สำเร็จ" }).waitFor();
  await page.screenshot({ path: `${outDir}/member-load-error-390.png` });
  failBootstrap = false;
  await page.getByRole("button", { name: "ลองอีกครั้ง" }).click();
  await page.locator(".phone > .content").waitFor();
  // First open: the app frame with skeleton blocks, then the member's data. Reopen: the saved data at
  // once with a thin line while it refreshes, and the saved data kept when the refresh fails.
  await page.setViewportSize(viewports[1]);
  await page.evaluate(() => localStorage.removeItem("ppa_member_cache_v1"));
  bootstrapDelayMs = 1500;
  await page.goto(`${base}/__responsive__/member?screen=home&keepcache=1`);
  await page.locator(".member-loading").waitFor();
  assert.equal(await page.locator(".phone > .content").count(), 0, "nothing interactive before the data arrives");
  assert.equal(await page.getByRole("status").filter({ hasText: "กำลังโหลดข้อมูลสมาชิก" }).count(), 1, "the loading state is announced once");
  await page.screenshot({ path: `${outDir}/member-loading-390.png` });
  await page.locator(".phone > .content").waitFor();
  await page.goto(`${base}/__responsive__/member?screen=home&keepcache=1`);
  await page.locator(".phone > .content").waitFor({ timeout: 1000 });
  assert.equal(await page.locator(".member-loading").count(), 0, "a reopen shows the saved data at once");
  await page.locator(".member-updating").waitFor();
  await page.screenshot({ path: `${outDir}/member-reopen-390.png` });
  await page.locator(".member-updating").waitFor({ state: "detached" });
  bootstrapDelayMs = 0;
  failBootstrap = true;
  await page.goto(`${base}/__responsive__/member?screen=home&keepcache=1`);
  await page.getByText("ยังอัปเดตข้อมูลไม่ได้ กำลังแสดงข้อมูลล่าสุดที่บันทึกไว้", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "โหลดข้อมูลไม่สำเร็จ" }).count(), 0, "saved data stays on screen when the refresh fails");
  failBootstrap = false;
  await page.evaluate(() => localStorage.removeItem("ppa_member_cache_v1"));
  // Court times and calendar days show skeletons while availability loads.
  availabilityDelayMs = 2000;
  await page.goto(`${base}/__responsive__/member?screen=sports`);
  await page.locator(".prototype-list button").first().click();
  await page.locator(".slot-skeleton").first().waitFor();
  assert.equal(await page.locator(".slot-list button").count(), 0, "no court can be chosen before its availability is known");
  assert.ok(await page.locator(".booking-calendar-grid .sk-day").count() >= 28, "calendar days show skeletons while the month loads");
  await page.screenshot({ path: `${outDir}/booking-loading-390.png` });
  availabilityDelayMs = 0;
  await page.locator(".slot-list button:enabled").first().waitFor();
  assert.equal(await page.locator(".slot-skeleton").count(), 0);
  // Payment: the amount first, each method named, nothing charged before the member confirms.
  const contentBeforePayment = member.contentItems;
  member.contentItems = [...packageCatalog, ...launchContent];
  await page.goto(`${base}/__responsive__/member?screen=plans`);
  await page.locator(".plan-card-cta").first().click();
  await page.locator(".pay-page").waitFor();
  const walletOption = page.locator(".pay-option").filter({ hasText: "จ่ายด้วยเครดิตในแอป" });
  assert.equal(await walletOption.isDisabled(), true, "credit below the price cannot be chosen");
  assert.match(await walletOption.innerText(), /เครดิตไม่พอ คงเหลือ 2,000 ฿/, "it says why");
  assert.equal(await page.locator(".pay-option.recommended").filter({ hasText: "โอนผ่านพร้อมเพย์" }).count(), 1, "the method that can pay is highlighted");
  assert.match(await page.locator(".pay-total").innerText(), /19,200 ฿/);
  await page.screenshot({ path: `${outDir}/payment-390.png` });
  await page.locator(".pay-option").filter({ hasText: "โอนผ่านพร้อมเพย์" }).click();
  const payConfirm = page.getByRole("dialog", { name: "ยืนยันการชำระเงิน" });
  await payConfirm.waitFor();
  assert.match(await payConfirm.innerText(), /Fitness \(12 เดือน\)[\s\S]*19,200 ฿[\s\S]*พร้อมเพย์/, "what, how much and how");
  await page.screenshot({ path: `${outDir}/payment-confirm-390.png` });
  await payConfirm.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await payConfirm.waitFor({ state: "detached" });
  assert.equal(await page.locator(".pay-page").count(), 1, "cancel keeps the member on the payment screen");
  await page.goto(`${base}/__responsive__/member?screen=wallet`);
  await page.locator(".wallet-actions button").click();
  await page.locator(".pay-option").filter({ hasText: "โอนผ่านพร้อมเพย์" }).click();
  await page.getByRole("dialog", { name: "ยืนยันการชำระเงิน" }).getByRole("button", { name: "สร้าง QR ชำระเงิน", exact: true }).click();
  await page.locator(".pay-qr-image").waitFor();
  assert.equal(topupRequests.length, 1, "one request after one confirmation");
  // Booking summary: the total and the confirm button stay on screen.
  await page.goto(`${base}/__responsive__/member?screen=sports`);
  await page.locator(".prototype-list button").first().click();
  await page.locator(".slot-list button:enabled").first().click();
  await page.locator(".sticky-summary .primary").click();
  await page.getByRole("button", { name: /ไปหน้าสรุป/ }).click();
  const confirmBooking = page.getByRole("button", { name: /ยืนยันและชำระเงิน/ });
  await confirmBooking.waitFor();
  const confirmBox = await confirmBooking.boundingBox();
  assert.ok(confirmBox && confirmBox.y + confirmBox.height <= viewports[1].height - 60, "the booking confirmation is on screen without scrolling");
  assert.match(await page.locator(".summary-total").innerText(), /\d+ ฿/);
  await page.screenshot({ path: `${outDir}/booking-summary-390.png` });
  // The confirmation in English and Chinese: nothing left in Thai.
  for (const [locale, title, cancel] of [["en", "Confirm payment", "Cancel"], ["zh", "确认付款", "取消"]]) {
    await page.locator(".language-switcher select").selectOption(locale);
    await page.goto(`${base}/__responsive__/member?screen=wallet`);
    await page.locator(".wallet-actions button").click();
    await page.locator(".pay-option").last().click();
    const translated = page.getByRole("dialog", { name: title });
    await translated.waitFor();
    assert.doesNotMatch((await translated.innerText()).replaceAll("฿", ""), /[\u0e00-\u0e7f]/, `${locale}: the payment confirmation is fully translated`);
    if (locale === "en") await page.screenshot({ path: `${outDir}/payment-confirm-en-390.png` });
    await translated.getByRole("button", { name: cancel, exact: true }).click();
  }
  await page.locator(".language-switcher select").selectOption("th");
  member.contentItems = contentBeforePayment;
  const live = await context.newPage();
  for (const viewport of [viewports[0], viewports[1], viewports[2], viewports[4], viewports[6]]) {
    await live.setViewportSize(viewport);
    for (const path of ["/", "/AdminConsole"]) {
      await live.goto(`${base}${path}`);
      await live.locator(path === "/" ? ".line-gate" : ".admin-login-form").waitFor();
      const fits = await live.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1);
      assert.ok(fits, `Live route ${path} overflows at ${viewport.width}`);
      if (viewport.width === 390) await live.screenshot({ path: `${outDir}/${path === "/" ? "line-gate" : "login"}-mobile.png` });
    }
  }
  await writeFile(`${outDir}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} responsive fixture views. Screenshots: ${outDir}`);
} finally { await browser.close(); }
