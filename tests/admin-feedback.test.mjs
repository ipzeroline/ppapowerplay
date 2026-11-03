import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load, require } from "./load-ts.mjs";

// Back office: every message says what kind it is (colour, icon and a word), results show where staff
// are looking, and important actions ask first in the app, not with the browser's confirm box.

const source = (file) => readFileSync(file, "utf8");
const adminFiles = ["components/admin-console.tsx", "components/admin-members.tsx", "components/admin-court-calendar.tsx", "components/admin-qr-scanner.tsx", "components/admin-dashboard.tsx", "components/admin-cashup.tsx", "components/admin-receipt.tsx", "components/admin-login.tsx"];
const section = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = text.indexOf(end, from + start.length);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return text.slice(from, to);
};
// One handler: from its first line to the closing brace at the component's indentation.
const handler = (text, marker) => {
  const from = text.indexOf(marker);
  assert.ok(from >= 0, `missing ${marker}`);
  return text.slice(from, text.indexOf("\n  }", from));
};
const absent = (text, pattern, label) => assert.ok(!pattern.test(text), label);
const present = (text, pattern, label) => assert.ok(pattern.test(text), label);
const render = (element) => require("react-dom/server").renderToStaticMarkup(element);
const h = (...args) => require("react").createElement(...args);

test("errors and warnings stay until closed, confirmations fade, and at most three show at once", () => {
  const { noticeLifetime, queueNotice, dismissNotice, maxToasts } = load("lib/admin-notices.ts");
  assert.equal(noticeLifetime("error"), null, "an error waits for staff to read it");
  assert.equal(noticeLifetime("warning"), null);
  assert.ok(noticeLifetime("success") >= 5000 && noticeLifetime("success") <= 8000);
  assert.ok(noticeLifetime("info") >= 5000);
  assert.equal(maxToasts, 3);
  let queue = [];
  queue = queueNotice(queue, { tone: "error", text: "ลบไม่สำเร็จ" }, 1);
  for (const [id, text] of [[2, "A"], [3, "B"], [4, "C"]]) queue = queueNotice(queue, { tone: "success", text }, id);
  assert.deepEqual(queue.map((item) => item.id), [1, 3, 4], "the oldest confirmation makes room; the unread error stays");
  queue = queueNotice(queue, { tone: "success", text: "C" }, 5);
  assert.deepEqual(queue.map((item) => item.id), [1, 3, 5], "the same message again replaces itself instead of stacking");
  assert.deepEqual(dismissNotice(queue, 1).map((item) => item.id), [3, 5]);
  let errors = [];
  for (const id of [1, 2, 3, 4]) errors = queueNotice(errors, { tone: "error", text: `E${id}` }, id);
  assert.deepEqual(errors.map((item) => item.id), [2, 3, 4], "with only errors, the oldest goes");
});

test("a notice names its kind in words and with an icon, so it never depends on colour alone", () => {
  const { AdminNotice } = load("components/admin-notice.tsx");
  for (const [tone, thai, english, role] of [["success", "สำเร็จ", "Success", "status"], ["error", "ไม่สำเร็จ", "Error", "alert"], ["warning", "โปรดตรวจสอบ", "Warning", "alert"], ["info", "แจ้งให้ทราบ", "Info", "status"]]) {
    const markup = render(h(AdminNotice, { tone, lang: "th" }, "ข้อความทดสอบ"));
    assert.match(markup, new RegExp(`class="admin-notice ${tone}"`), tone);
    assert.match(markup, new RegExp(`role="${role}"`), `${tone} is announced as ${role}`);
    assert.match(markup, new RegExp(`>${thai}<`), `${tone} says ${thai}`);
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, "an icon beside the words");
    assert.match(markup, /ข้อความทดสอบ/);
    assert.match(render(h(AdminNotice, { tone, lang: "en" }, "Text")), new RegExp(`>${english}<`));
  }
  const closable = render(h(AdminNotice, { tone: "error", lang: "th", onClose: () => {} }, "x"));
  assert.match(closable, /<button[^>]*aria-label="ปิดการแจ้งเตือน"/, "a toast can be closed");
});

test("the confirmation focuses the way back first and names exactly what will happen", () => {
  const { AdminConfirmDialog } = load("components/admin-confirm.tsx");
  const markup = render(h(AdminConfirmDialog, { lang: "th", onAnswer: () => {}, options: { title: "ลบบทบาทนี้?", message: "ลบถาวร", details: [["บทบาท", "Front desk"]], confirmLabel: "ลบบทบาท", danger: true } }));
  assert.match(markup, /<dialog[^>]*role="alertdialog"/, "announced as a question that needs an answer");
  assert.match(markup, /<h2[^>]*>ลบบทบาทนี้\?<\/h2>/);
  assert.match(markup, /<dt>บทบาท<\/dt><dd>Front desk<\/dd>/, "the details of what is about to change");
  const buttons = [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)];
  assert.deepEqual(buttons.map((match) => match[1]), ["กลับ", "ลบบทบาท"], "the way back comes first, so a stray Enter never confirms");
  assert.match(buttons[1][0], /class="[^"]*\bdanger\b[^"]*"/, "a destructive action is shown in red");
  const english = render(h(AdminConfirmDialog, { lang: "en", onAnswer: () => {}, options: { title: "Confirm?", confirmLabel: "Record sale" } }));
  assert.match(english, />Go back</);
  assert.match(english, /class="primary"[^>]*>Record sale</);
});

test("important back-office actions ask first in the app, never with the browser's confirm box", () => {
  for (const file of adminFiles) absent(source(file), /window\.confirm\(/, file);
  const admin = source("components/admin-console.tsx");
  const asks = (text, label) => present(text, /await confirm\(/, label);
  const bookings = section(admin, "function BookingManager(", "function TrainerTable(");
  asks(handler(bookings, "const updateBooking = async"), "check-in, expiry and cancelling from the booking list");
  asks(handler(bookings, "const removeCourt = async"), "hiding a court");
  asks(handler(section(admin, "function PaymentTable(", "function ReportDataList"), "const approve = async"), "confirming that a payment was received");
  present(section(admin, "function PaymentTable(", "function ReportDataList"), /onClick=\{\(\) => approve\(r\)\}/, "the confirm-paid button asks first");
  asks(handler(section(admin, "function CouponManager(", "function ContentManager("), "const remove = async"), "turning off a coupon");
  asks(handler(section(admin, "function ContentManager(", "const couponCategories"), "const remove = async"), "turning off app content");
  asks(handler(section(admin, "function TrainerManager(", "function TrainerPhoto("), "const remove = async"), "turning off a trainer");
  const staff = section(admin, "function StaffManager(", "function RoleManager(");
  asks(handler(staff, "const remove = async"), "deleting a staff account");
  const staffSave = handler(staff, "const submit = async");
  present(staffSave, /suspended/, "staff save knows about suspending");
  asks(staffSave, "suspending a staff account");
  asks(handler(section(admin, "function RoleManager(", "function adminFetch("), "const remove = async"), "deleting a role");
  const members = source("components/admin-members.tsx");
  asks(handler(members, "async function adjustCredit"), "adjusting a member's credit");
  asks(handler(members, "async function sell"), "a counter sale");
  const profile = handler(members, "async function saveProfile");
  present(profile, /suspended/, "member save knows about suspending");
  asks(profile, "suspending a member");
  const calendar = source("components/admin-court-calendar.tsx");
  asks(section(calendar, "function BookingDetail(", "function BlockDialog("), "checking in from the court calendar");
  asks(section(calendar, "function BlockDetail(", "export function CounterPaymentDialog("), "removing a court block");
});

test("every back-office message says whether it is a success, an error, a warning or a note", () => {
  for (const file of adminFiles) {
    const text = source(file);
    absent(text, /className="admin-message/, `${file}: no more plain grey messages`);
    absent(text, /<p role="(status|alert)">\{message\}<\/p>/, `${file}: no unstyled messages`);
  }
  const admin = source("components/admin-console.tsx");
  absent(admin, /adminMessage|setAdminMessage/, "no single message shared by every tab");
  absent(admin, /setMessage\(/, "results go to notify (toast) or to a form's own notice");
  const scanner = source("components/admin-qr-scanner.tsx");
  present(scanner, /<AdminNotice tone=\{message\.tone\}/, "scanner results are coloured by outcome");
  present(scanner, /<AdminNotice tone="warning"[^>]*>\{th \? "เช็คอินได้ในวันที่จอง"/, "the not-today warning is a warning");
  absent(source("app/admin.css"), /^\.admin-message/m, "one notice style in the stylesheet");
});

test("results of saving and deleting reach the screen, also after the form has closed", () => {
  const admin = source("components/admin-console.tsx");
  for (const key of ["bookingCancelled", "courtDeleted", "courtCreated", "couponDeleted", "couponCreated", "contentDeleted", "contentCreated", "trainerDeleted", "trainerCreated", "staffDeleted", "staffCreated", "roleDeleted", "roleCreated", "paymentPaidDone"]) {
    present(admin, new RegExp(`notify\\("success", [^;]*t\\.${key}\\b`), key);
  }
  present(admin, /notify\("error", /, "failures go to the toast too");
  present(admin, /<AdminFeedbackProvider lang=\{lang\}>/, "the whole console shares one toast area and one confirmation");
  const provider = source("components/admin-feedback.tsx");
  present(provider, /className="admin-toasts"/, "the toast area");
  present(provider, /aria-live="polite"/, "toasts are announced");
  const css = source("app/admin.css");
  assert.match(section(css, ".admin-toasts {", "}"), /position: fixed;/, "toasts stay on screen while staff scroll");
  present(css, /@media \(prefers-reduced-motion: reduce\)[^}]*\.admin-toast/, "toasts appear without motion when motion is reduced");
  const calendar = source("components/admin-court-calendar.tsx");
  present(calendar, /notify\(/, "calendar changes show in the same toast area");
});
