import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

const base = "http://localhost:3000";
const outDir = "/private/tmp/ppa-responsive";
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
const adminData = { metrics: ["Members", "Bookings", "Payments", "Revenue"].map((label) => ({ label, value: 125, hint: "Test fixture" })), users: [user], bookings, courts: [{ id: 1, name: "Court A", sportId: 1, sportName: "Badminton", capacity: 4, status: "available", hourlyRate: 200 }], coupons: [], trainers: [trainer], payments: [], staff: [admin], roles: [{ id: 1, code: "super_admin", nameTh: "ผู้ดูแลระบบ", nameEn: "Administrator", level: 100, isSystem: true, permissionCodes: [] }], permissions: [], currentAdmin: admin, auditLogs: [], contentItems: [], systemHealth: [], securityItems: [] };
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__responsive__/**", async (route) => {
    if (route.request().url().endsWith("bundle.js")) return route.fulfill({ contentType: "text/javascript", body: js });
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="th" class="${fontClass}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/__responsive__/bundle.js"></script></body></html>` });
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/bootstrap") return failBootstrap ? route.fulfill({ status: 503, json: { message: "Service unavailable" } }) : route.fulfill({ json: member });
    if (url.pathname === "/api/coupons") return route.fulfill({ json: { coupons: [] } });
    if (url.pathname === "/api/courts/availability") return route.fulfill({ json: { slots: [] } });
    if (url.pathname === "/api/qr") return route.fulfill({ status: 404, json: { message: "No active rights" } });
    return route.fulfill({ status: 405, json: { message: "Read-only UI fixture" } });
  });
  const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const screen of ["home", "sports", "mybooking", "trainer", "profile", "scan"]) {
      await page.goto(`${base}/__responsive__/member?screen=${screen}`);
      await page.locator(".phone > .content").waitFor();
      await page.evaluate(() => document.fonts.ready);
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
      if (screen === "home" && [390, 768, 1440].includes(viewport.width)) await page.screenshot({ path: `${outDir}/member-${viewport.width}.png` });
      results.push({ area: "member", screen, viewport, metrics });
    }
    for (const tab of ["dashboard", "members", "bookings", "staff", "roles", "reports", "trainers", "content"]) {
      await page.goto(`${base}/__responsive__/admin?tab=${tab}`);
      await page.locator(".admin-main").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const main = document.querySelector(".admin-main");
        return { docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, mainOverflow: main.scrollWidth - main.clientWidth };
      });
      assert.ok(metrics.docWidth <= viewport.width + 1 && metrics.docHeight <= viewport.height + 1 && metrics.mainOverflow <= 1, JSON.stringify({ tab, viewport, metrics }));
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
