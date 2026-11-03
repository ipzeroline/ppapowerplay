import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load, require } from "./load-ts.mjs";

// QR at the counter: what a real day needs, not only what a unit of code does.

const token = "Ab3_x-9QrStUvWxYz0123456789abcdefghijkLMNOP"; // 43 characters, base64url

test("the scanner reads QR text from a webcam, a USB scanner on a Thai keyboard, or a typed code", () => {
  const { extractQrToken } = load("lib/qr.ts");
  const url = `https://gymnos234.com/q/${token}`;
  assert.equal(extractQrToken(url), token, "the short QR address");
  assert.equal(extractQrToken(`https://gymnos234.com/AdminConsole/scanner?token=${token}`), token, "the scanner address it opens");
  assert.equal(extractQrToken(`https://example.invalid/api/qr/verify?token=${token}`), token, "codes issued before this change still work");
  assert.equal(extractQrToken(`  ${token} `), token);
  // A keyboard-wedge scanner with the PC keyboard set to Thai (Kedmanee) types every key as Thai.
  const thaiKeys = { a: "ฟ", b: "ิ", c: "แ", d: "ก", e: "ำ", f: "ด", g: "เ", h: "้", i: "ร", j: "่", k: "า", l: "ส", m: "ท", n: "ื", o: "น", p: "ย", q: "ๆ", r: "พ", s: "ห", t: "ะ", u: "ี", v: "อ", w: "ไ", x: "ป", y: "ั", z: "ผ",
    A: "ฤ", B: "ฺ", C: "ฉ", D: "ฏ", E: "ฎ", F: "โ", G: "ฌ", H: "็", I: "ณ", J: "๋", K: "ษ", L: "ศ", M: "?", N: "์", O: "ฯ", P: "ญ", Q: "๐", R: "ฑ", S: "ฆ", T: "ธ", U: "๊", V: "ฮ", W: '"', X: ")", Y: "ํ", Z: "(",
    1: "ๅ", 2: "/", 3: "-", 4: "ภ", 5: "ถ", 6: "ุ", 7: "ึ", 8: "ค", 9: "ต", 0: "จ", "-": "ข", _: "๘", ":": "ซ", "/": "ฝ", ".": "ใ", "?": "ฦ", "=": "ช" };
  const typedOnThai = [...url].map((character) => thaiKeys[character] ?? character).join("");
  assert.match(typedOnThai, /[฀-๿]/);
  assert.equal(extractQrToken(typedOnThai), token, "the Thai-layout text is read back as the QR text");
  assert.equal(extractQrToken("invalid"), "");
  assert.equal(extractQrToken(`https://gymnos234.com/AdminConsole/scanner?token=${"!".repeat(43)}`), "");
});

function verifyRoute(rows, writes = []) {
  const conn = {
    beginTransaction: async () => {}, rollback: async () => {}, commit: async () => {}, release: () => {},
    execute: async (sql, params) => {
      writes.push([sql, params]);
      for (const [needle, value] of rows) if (sql.includes(needle)) return typeof value === "function" ? value(sql) : value;
      return [{ affectedRows: 1 }];
    },
  };
  return load("app/api/admin/qr/verify/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session", hasAdminPermission: () => true },
    "@/lib/db": { pool: { getConnection: async () => conn } },
  });
}
const call = (route, consume) => {
  const { NextRequest } = require("next/server");
  return route.POST(new NextRequest("http://localhost/api/admin/qr/verify", { method: "POST", body: JSON.stringify({ token, consume }) }));
};

test("staff who previewed a member QR can still confirm it for two minutes after the member's screen moved on", async () => {
  const tokenRow = (expired, consumeExpired) => [[{ id: 11, userId: 2, purpose: "member", refId: "3", usedAt: null, expired, consumeExpired, displayName: "คุณเอ", memberCode: "PPA-1" }]];
  const lapsed = verifyRoute([["FROM qr_tokens", tokenRow(1, 0)], ["FROM memberships", [[{ id: 3 }]]]]);
  assert.equal((await call(lapsed, false)).status, 409, "a QR first shown after it expired is refused");
  assert.equal((await call(lapsed, true)).status, 200, "the confirm after a preview still works");
  const stale = verifyRoute([["FROM qr_tokens", tokenRow(1, 1)], ["FROM memberships", [[{ id: 3 }]]]]);
  assert.equal((await call(stale, true)).status, 409, "not after the two minutes");
  const source = readFileSync("app/api/admin/qr/verify/route.ts", "utf8");
  assert.match(source, /qt\.expires_at <= NOW\(\) - INTERVAL 2 MINUTE consumeExpired/);
});

test("the scanner shows what the QR grants: plan, booking time, coupon uses left", async () => {
  const writes = [];
  const route = verifyRoute([
    ["FROM qr_tokens", [[{ id: 11, userId: 2, purpose: "booking", refId: "BK1", usedAt: null, expired: 0, consumeExpired: 0, displayName: "คุณเอ", memberCode: "PPA-1" }]]],
    ["checkInToday", [[{ title: "แบดมินตัน - Court A", startsAt: "2026-11-05 18:00", endsAt: "19:00", checkInToday: 0 }]]],
    ["FROM bookings", [[{ id: 5 }]]],
  ], writes);
  const response = await call(route, false);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.detail, { title: "แบดมินตัน - Court A", startsAt: "2026-11-05 18:00", endsAt: "19:00", checkInOpen: false });
  assert.equal(writes.some(([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT")), false, "a preview changes nothing");
});

test("a booking is checked in on its own day only, with the date in the refusal", async () => {
  const writes = [];
  const route = verifyRoute([
    ["FROM qr_tokens", [[{ id: 11, userId: 2, purpose: "booking", refId: "BK1", usedAt: null, expired: 0, consumeExpired: 0, displayName: "คุณเอ", memberCode: "PPA-1" }]]],
    ["UPDATE bookings", [{ affectedRows: 0 }]],
    ["DATE_FORMAT(starts_at", [[{ startsAt: "5 พ.ย. 18:00" }]]],
    ["FROM bookings", [[{ id: 5 }]]],
  ], writes);
  const response = await call(route, true);
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /5 พ\.ย\. 18:00/);
  assert.match(writes.find(([sql]) => sql.startsWith("UPDATE bookings"))[0], /starts_at < CURDATE\(\) \+ INTERVAL 1 DAY/, "never a future day's booking");
  assert.equal(writes.some(([sql]) => sql.startsWith("INSERT INTO member_visits")), false);
});

test("member QR codes are limited per member, so a club Wi-Fi shared by many members is not blocked", async () => {
  const keys = [];
  const route = load("app/api/qr/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 42 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: ({ key, limit }) => { keys.push([key, limit]); return null; }, clientIp: async () => "203.0.113.9", secureResponse: (response) => response },
    "@/lib/db": { query: async () => [{ id: 12, planName: "Fitness" }], pool: { getConnection: async () => ({ execute: async () => [{}], release: () => {} }) } },
  });
  const { NextRequest } = require("next/server");
  const saved = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://gymnos234.com";
  try {
    const response = await route.GET(new NextRequest("http://127.0.0.1:2344/api/qr?purpose=member"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.verifyUrl, /^https:\/\/gymnos234\.com\/q\/[A-Za-z0-9_-]{43}$/, "a short public address: fewer QR squares, read from further away");
  } finally {
    if (saved === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = saved;
  }
  assert.ok(keys.some(([key, limit]) => key === "qr:member:42" && limit === 40), "40 a minute for each member");
  assert.ok(keys.some(([key, limit]) => key === "qr:203.0.113.9" && limit >= 600), "a shared address allows many members");
});

test("the staff scanner names what it grants and is ready for the next scan", () => {
  const scanner = readFileSync("components/admin-qr-scanner.tsx", "utf8");
  for (const label of ["แพ็กเกจสมาชิก", "การจองสนาม", "คูปอง", "สิทธิ์/รางวัล", "ยืนยันเข้าใช้บริการ", "เช็คอินการจอง", "ใช้คูปอง 1 ครั้ง", "ใช้สิทธิ์ / รับรางวัล", "เช็คอินได้ในวันที่จอง"]) {
    assert.ok(scanner.includes(label), label);
  }
  assert.match(scanner, /searchParams\.get\("token"\)|get\("token"\)/, "a QR opened from a phone camera is checked at once");
  assert.match(scanner, /\.select\(\)/, "the next scan replaces the last code");
});

test("the short QR address opens the staff scanner with the code, and nothing else", async () => {
  const route = load("app/q/[token]/route.ts");
  const open = (value) => route.GET(new Request(`https://gymnos234.com/q/${value}`), { params: Promise.resolve({ token: value }) });
  const response = await open(token);
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), "https://gymnos234.com").pathname + new URL(response.headers.get("location"), "https://gymnos234.com").search, `/AdminConsole/scanner?token=${token}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await open("not-a-token")).status, 404);
});
