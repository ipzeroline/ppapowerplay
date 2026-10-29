import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import QRCode from "qrcode";

const base = "http://localhost:3000";
const outDir = "/private/tmp/ppa-responsive";
const fixtureQrSvg = await QRCode.toString("https://example.invalid/qr-test-only", { type: "svg", margin: 1, width: 220 });
await mkdir(outDir, { recursive: true });
const pageHtml = await (await fetch(base)).text();
const styles = [...pageHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((match) => match[0]).join("");
assert.ok(styles, "The local app must serve its compiled styles");
const fontClass = pageHtml.match(/<html[^>]+class="([^"]+)"/)?.[1] || "";
const user = { id: 1, displayName: "สมาชิกทดสอบหน้าจอ Responsive Layout", memberCode: "PPA-TEST", phone: "0000000000", email: "test@example.invalid", status: "active" };
const trainer = { id: 1, slug: "coach", name: "Trainer responsive test", nickname: "Coach", role: "Personal Trainer", avatar: "PPA", experience: "5 years", startPrice: 1000, active: true, sortOrder: 1, certifications: [], specialties: [], packages: [], weeklySchedule: [] };
const bookings = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, bookingNo: `BK-TEST-${i}`, title: "ทดสอบรายการจองที่มีชื่อยาวสำหรับทุกขนาดหน้าจอ", displayName: user.displayName, sportName: "Badminton", courtName: "Court A", startsAt: "2026-12-10T10:00:00+07:00", endsAt: "2026-12-10T11:00:00+07:00", status: "paid", amount: 200, players: 2 }));
const member = { user, wallet: { balance: 2000, coinBalance: 10, pointBalance: 100 }, sports: [{ id: 1, slug: "badminton", name: "Badminton", icon: "PPA", requiresBooking: true, baseRate: 200 }], bookings, coupons: [], trainers: [trainer], groups: [], notifications: [], contentItems: [], memberships: [], entitlements: [] };
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
const adminData = { metrics: ["Members", "Bookings", "Payments", "Revenue"].map((label) => ({ label, value: 125, hint: "Test fixture" })), users: [user], bookings, courts: [{ id: 1, name: "Court A", sportId: 1, sportName: "Badminton", capacity: 4, status: "available", hourlyRate: 200 }], coupons: [], trainers: [trainer], payments: [paymentFixture], staff: [admin], roles: [{ id: 1, code: "super_admin", nameTh: "ผู้ดูแลระบบ", nameEn: "Administrator", level: 100, isSystem: true, permissionCodes: [] }], permissions: [], currentAdmin: admin, auditLogs: [], contentItems: [], systemHealth: [], securityItems: [] };
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PpaApp} from './components/ppa-app'; import {AdminConsole} from './components/admin-console'; const tab=new URLSearchParams(location.search).get('tab')||'dashboard'; createRoot(document.getElementById('root')).render(location.pathname.includes('admin') ? <AdminConsole adminKey="" data={${JSON.stringify(adminData)}} initialTab={tab}/> : <PpaApp/>);`;
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
  const page = await context.newPage();
  let failBootstrap = false;
  let failAvailability = false;
  let emptyMember = false;
  let qrMode = "missing";
  const scanRequests = [];
  const paymentRequests = [];
  let failPayment = true;
  const bookingRequests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__responsive__/**", async (route) => {
    if (route.request().url().endsWith("bundle.js")) return route.fulfill({ contentType: "text/javascript", body: js });
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="th" class="${fontClass}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/__responsive__/bundle.js"></script></body></html>` });
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/members") {
      if (route.request().method() === "PUT") return route.fulfill({ json: { ok: true } });
      if (url.searchParams.has("id")) return route.fulfill({ json: { member: { ...user, balance: 2500 }, history: [{ id: 1, amount: 100, kind: "topup", note: "Fixture credit", createdAt: "2026-10-29T01:00:00Z", staffName: "Test admin", balanceBefore: "2400.00", balanceAfter: "2500.00", refType: "admin_credit" }], nextCursor: null } });
      return route.fulfill({ json: { members: [{ ...user, balance: 2500 }], hasMore: false } });
    }
    if (url.pathname === "/api/admin/members/credit") return route.fulfill({ json: { ok: true, balance: "2510.00" } });
    if (url.pathname === "/api/admin/payments") {
      paymentRequests.push(route.request().postDataJSON());
      if (failPayment) return route.fulfill({ status: 409, json: { message: "Payment fixture conflict" } });
      return route.fulfill({ json: { payments: [{ ...paymentFixture, status: "paid" }] } });
    }
    if (url.pathname === "/api/admin/qr/verify") {
      const input = route.request().postDataJSON();
      scanRequests.push(input);
      if (input.token === "invalid") return route.fulfill({ status: 400, json: { message: "QR token ไม่ถูกต้อง" } });
      return route.fulfill({ json: { valid: true, consumed: Boolean(input.consume), qr: { displayName: "Scanner Test", memberCode: "PPA-TEST", purpose: "member", refId: "1" } } });
    }
    if (url.pathname === "/api/bootstrap") return failBootstrap ? route.fulfill({ status: 503, json: { message: "Service unavailable" } }) : route.fulfill({ json: emptyMember ? { ...member, bookings: [], memberships: [] } : member });
    if (url.pathname === "/api/auth/line" && route.request().method() === "DELETE") return route.fulfill({ json: { ok: true } });
    if (url.pathname === "/api/coupons") return route.fulfill({ json: { coupons: [] } });
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
    for (const screen of ["home", "sports", "courts", "mybooking", "trainer", "profile", "scan"]) {
      await page.goto(`${base}/__responsive__/member?screen=${screen === "courts" ? "sports" : screen}`);
      await page.locator(".phone > .content").waitFor();
      if (screen === "courts") await page.locator('.prototype-list button').first().click();
      if (["mybooking", "profile", "scan"].includes(screen)) await page.locator('.tabbar button').nth({ mybooking: 3, profile: 4, scan: 2 }[screen]).click();
      if (screen === "home") {
        await page.getByRole('heading', { name: 'PPA Sport Complex', exact: true }).waitFor();
        for (const selector of ['.member-card', '.home-carousel', '.live-banner', '.fyg-row', '.quick-booking-row', '.gymnos-banner', '.svc-grid', '.stat-row']) assert.ok(await page.locator(selector).count(), 'Original home section is present: ' + selector);
        assert.equal(await page.locator('.qr-mini-grid').count(), 0, 'Home must not render fake QR patterns');
        assert.equal(await page.getByText('Premium Member', { exact: true }).count(), 0, 'Inactive members must not be labeled premium');
      }
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
        if (viewport.width < 1024) {
          await page.getByRole("button", { name: "Open menu", exact: true }).click();
          await page.getByRole("dialog", { name: "Admin navigation" }).waitFor();
          await page.keyboard.press("Escape");
          assert.equal(await page.locator(".admin-console").getAttribute("data-menu-open"), "false");
        }
        if ([390, 768, 1440].includes(viewport.width)) await page.screenshot({ path: `${outDir}/admin-${viewport.width}.png` });
        await page.locator(".admin-profile-actions button").first().click();
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
        await page.getByRole("button", { name: "สว่าง", exact: true }).click();
        assert.equal(await page.locator(".admin-console").getAttribute("data-theme"), "light");
        if (viewport.width === 390) await page.screenshot({ path: `${outDir}/admin-light-mobile.png` });
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
  await page.locator('.coupon-list').first().waitFor({ state: 'attached' });
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
  const translatedScreens = ["home", "sports", "courts", "datetime", "summary", "payment", "mybooking", "profile", "membership", "wallet", "coupon", "trainer", "trainer-detail", "help", "notifications", "classhub", "classschedule", "livetv", "promotion", "scan"];
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
        if (locale !== "th") assert.doesNotMatch(contentText.replaceAll(user.displayName, "").replaceAll(bookings[0].title, "").replaceAll("฿", ""), /[\u0e00-\u0e7f]/, `${locale} ${screen}: untranslated interface text`);
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
  assert.equal(await page.getByRole("button", { name: "ยืนยันใช้สิทธิ์ / เช็คอิน", exact: true }).count(), 0);
  await page.getByLabel("QR URL หรือรหัสจากเครื่องอ่าน").fill("a".repeat(43));
  await page.getByRole("button", { name: "ตรวจสอบ QR", exact: true }).click();
  await page.getByText("Scanner Test", { exact: true }).waitFor();
  assert.equal(scanRequests.at(-1).consume, false);
  await page.getByRole("button", { name: "ยืนยันใช้สิทธิ์ / เช็คอิน", exact: true }).click();
  await page.getByText("บันทึกการใช้สิทธิ์เรียบร้อยแล้ว", { exact: true }).waitFor();
  assert.equal(scanRequests.filter((request) => request.consume).length, 1);
  assert.equal(await page.getByRole("button", { name: "ยืนยันใช้สิทธิ์ / เช็คอิน", exact: true }).count(), 0);
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
    canvas.getContext("2d").drawImage(image, 0, 0, 660, 660);
    const media = canvas.captureStream(10);
    window.__scannerTestStream = media;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => media });
  }, await QRCode.toString(`https://example.invalid/api/qr/verify?token=${"b".repeat(43)}`, { type: "svg", margin: 4, width: 660 }));
  await page.getByRole("button", { name: "เปิดกล้องสแกน", exact: true }).click();
  await page.getByText("Scanner Test", { exact: true }).waitFor();
  assert.ok(scanRequests.at(-1).token.endsWith("b".repeat(43)), "Camera must decode the generated QR frame");
  assert.equal(scanRequests.at(-1).consume, false, "Camera scan only previews the right");
  assert.equal(await page.evaluate(() => window.__scannerTestStream.getTracks().every((track) => track.readyState === "ended")), true, "Camera stops after detection");
  await page.goto(`${base}/__responsive__/admin?tab=dashboard`);
  const approvePayment = page.getByRole("button", { name: "ยืนยันชำระ", exact: true });
  await approvePayment.waitFor();
  assert.equal(await approvePayment.isEnabled(), true, "Session-authenticated staff need no legacy admin key");
  await approvePayment.click();
  await page.getByText("Payment fixture conflict", { exact: true }).waitFor();
  assert.equal(await approvePayment.isEnabled(), true, "Failed approval remains retryable");
  failPayment = false;
  await approvePayment.click();
  await page.getByText("อัปเดต payment แล้ว", { exact: true }).waitFor();
  assert.equal(await approvePayment.isDisabled(), true, "Paid payment cannot be approved again");
  assert.deepEqual(paymentRequests, [1, 2].map(() => ({ paymentNo: "PAY-UI-TEST", status: "paid" })));
  await page.screenshot({ path: `${outDir}/payment-confirmation.png` });
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 360 });
  failBootstrap = true;
  await page.goto(`${base}/__responsive__/member?screen=home`);
  await page.getByRole("heading", { name: "โหลดข้อมูลไม่สำเร็จ" }).waitFor();
  failBootstrap = false;
  await page.getByRole("button", { name: "ลองอีกครั้ง" }).click();
  await page.locator(".phone > .content").waitFor();
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
