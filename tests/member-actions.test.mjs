import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { load } from "./load-ts.mjs";

// Member app: loading says so in words, key booking and payment buttons are clear, important actions
// ask first in the app (not the browser), and every message reaches all three languages.

const app = () => readFileSync("components/ppa-app.tsx", "utf8");
const catalog = () => new Set(load("lib/i18n/index.ts").allMessages.map(([key]) => key));

test("important member actions ask for confirmation in the app, not with the browser's confirm box", () => {
  const source = app();
  assert.doesNotMatch(source, /window\.confirm\(/, "a browser confirm box in LINE shows the site address and looks like a warning");
  const dialog = readFileSync("components/member-confirm.tsx", "utf8");
  assert.match(dialog, /export function ConfirmDialog/);
  for (const action of ["askPay", "askRedeem", "askCancelPending", "askLogout", "askLeaveGroup", "askCloseGroup"]) {
    assert.match(source, new RegExp(`function ${action}\\(`), action);
  }
  assert.match(source, /onPay=\{askPay\}/, "payment methods open the confirmation first");
  assert.match(source, /onRedeem=\{askRedeem\}/);
  assert.match(source, /onCancelPending=\{askCancelPending\}/);
  assert.match(source, /onLeave=\{askLeaveGroup\} onClose=\{askCloseGroup\}/);
});

test("the payment screen names each method, shows the amount and says why a method is unavailable", () => {
  const source = app();
  const screen = source.slice(source.indexOf("function PaymentScreen("), source.indexOf("function ScanScreen("));
  for (const text of ["ชำระเงิน", "ยอดชำระ", "เลือกวิธีชำระเงิน", "จ่ายด้วยเครดิตในแอป", "โอนผ่านพร้อมเพย์", "เครดิตไม่พอ คงเหลือ {{value0}} ฿"]) {
    assert.ok(screen.includes(`t("${text}"`), text);
  }
  assert.doesNotMatch(screen, /CONFIRM PAYMENT/, "no eyebrow repeating the heading");
  const summary = source.slice(source.indexOf('{screen === "summary" && ('), source.indexOf('{screen === "payment" && ('));
  assert.match(summary, /className="sticky-summary summary-actions"/, "the booking confirmation stays on screen with the total");
  assert.match(summary, /ยืนยันและชำระเงิน/);
});

test("loading states say so in words, with an icon", () => {
  const source = app();
  const loading = source.slice(source.indexOf("function MemberLoading("), source.indexOf("function SlotSkeleton("));
  assert.match(loading, /<LoadingNote[^>]*text=\{t\("กำลังโหลดข้อมูลสมาชิก"\)\}/);
  assert.match(source, /<LoadingNote text=\{t\("กำลังโหลด QR\.\.\."\)\}/, "the member QR says it is loading");
  assert.match(source, /className="member-updating-pill"/, "a reopen says it is updating");
  assert.match(source, /t\("กำลังดำเนินการ…"\)/, "busy booking and payment buttons say they are working");
  assert.match(readFileSync("components/booking-calendar.tsx", "utf8"), /<LoadingNote[^>]*text=\{t\("กำลังโหลดวันว่าง"\)\}/);
  assert.match(readFileSync("components/member-promptpay.tsx", "utf8"), /<LoadingNote text=\{t\("กำลังโหลด QR\.\.\."\)\}/);
  assert.match(readFileSync("components/member-ui.tsx", "utf8"), /export function LoadingNote/);
});

test("every message a member API can show is translated in all three languages", () => {
  const keys = catalog();
  const missing = [];
  const scan = (file) => {
    for (const match of readFileSync(file, "utf8").matchAll(/message: "([^"\n]*[฀-๿][^"\n]*)"/g)) if (!keys.has(match[1])) missing.push(`${file}: ${match[1]}`);
  };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (!/\/(admin|cron|health)$/.test(target)) walk(target); } else if (entry.name === "route.ts") scan(target);
    }
  };
  walk("app/api");
  assert.deepEqual(missing, []);
  assert.ok(keys.has("เติมเงิน Wallet"), "the top-up item name members see in their payment list");
});

test("every Thai string in member screens has its English and Chinese translation", async () => {
  const ts = (await import("typescript")).default;
  const keys = catalog();
  const files = ["components/ppa-app.tsx", "components/booking-calendar.tsx", "components/language-switcher.tsx", "components/member-confirm.tsx", ...readdirSync("components").filter((name) => /^(member-.*|gymnos-hub)\.tsx$/.test(name)).map((name) => `components/${name}`)];
  // Not translated on purpose: the currency sign, and each language's own name in the language menu.
  const untranslatable = new Set(["฿", "ไทย"]);
  const missing = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[฀-๿]/.test(node.text) && !keys.has(node.text) && !untranslatable.has(node.text)) {
        missing.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(missing, []);
});
