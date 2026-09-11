import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Compile the actual TS modules, replacing only framework/DB boundaries.
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = { exports: {} };
  cache.set(filename, compiled);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === "server-only") return {};
    if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`, mocks, cache);
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}

process.env.SESSION_SECRET = "security-test-secret-only-32-characters-long";
const session = load("lib/session.ts");

test("QR errors distinguish membership, authentication, throttling and service failures", () => {
  const { qrErrorKey } = load("lib/qr-presentation.ts");
  assert.equal(qrErrorKey(404, "member"), "qr.error.membership");
  assert.equal(qrErrorKey(404, "booking"), "qr.error.rights");
  assert.equal(qrErrorKey(401, "member"), "qr.error.session");
  assert.equal(qrErrorKey(403, "member"), "qr.error.forbidden");
  assert.equal(qrErrorKey(429, "member"), "qr.error.rate");
  assert.equal(qrErrorKey(503, "member"), "qr.error.service");
  assert.equal(qrErrorKey(undefined, "member"), "qr.error.service");
});

test("QR issuance fails closed without rights and reports database failure separately", async () => {
  const { NextRequest } = require("next/server");
  let mode = "missing";
  let connections = 0;
  let released = 0;
  const writes = [];
  const route = load("app/api/qr/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 7 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", secureResponse: (response) => response },
    "@/lib/db": {
      query: async (sql, params) => {
        assert.equal(params[0], 7);
        if (mode === "failure") throw new Error("private database details");
        return mode === "active" ? [{ id: 12, planName: "Active membership" }] : [];
      },
      pool: { getConnection: async () => {
        connections++;
        return { execute: async (...args) => { writes.push(args); }, release: () => { released++; } };
      } },
    },
  });
  const request = () => new NextRequest("http://localhost/api/qr?purpose=member");
  let response = await route.GET(request());
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, "NO_ACTIVE_MEMBERSHIP");
  assert.equal(connections, 0, "No token is issued without membership");
  mode = "failure";
  response = await route.GET(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "QR_SERVICE_UNAVAILABLE");
  assert.equal(connections, 0);
  mode = "active";
  response = await route.GET(request());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.svg, /<svg/);
  assert.equal(payload.expiresIn, 30);
  assert.equal(released, 1);
  const insert = writes.find(([sql]) => sql.startsWith("INSERT"));
  assert.deepEqual(insert[1].slice(0, 3), [7, "member", "12"]);
  assert.match(insert[1][3], /^[a-f0-9]{64}$/);
  assert.ok(!payload.verifyUrl.includes(insert[1][3]), "Only the hash is stored");
});

test("sessions reject tampering, expiry, wrong purpose and legacy identity cookies", () => {
  const token = session.signSession("member", "U-test-member", 60);
  assert.equal(session.readSession("member", token), "U-test-member");
  assert.equal(session.readSession("admin", token), null);
  assert.equal(session.readSession("member", token + ".extra"), null);
  assert.equal(session.readSession("member", token.replace(/^./, "X")), null);
  assert.equal(session.readSession("member", "U-test-member"), null);
  assert.equal(session.readSession("member", session.signSession("member", "U-test-member", -1)), null);
  assert.equal(session.readSession("member", "x".repeat(5000)), null);
});

test("frontend image URLs allow HTTPS and local paths without executable schemes or credentials", () => {
  const { safeImageSource } = load("lib/media.ts");
  assert.equal(safeImageSource("/uploads/trainers/photo.webp"), "/uploads/trainers/photo.webp");
  assert.equal(safeImageSource("https://images.example/photo.webp"), "https://images.example/photo.webp");
  for (const unsafe of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "//tracker.example/photo", "/\\tracker.example/photo", "https://user:password@example.com/photo", "http://example.com/photo", " https://example.com/photo"]) assert.equal(safeImageSource(unsafe), null);
});

test("member presentation never treats expired, cancelled or past bookings as upcoming", () => {
  const { upcomingBooking, bookingStatusLabel } = load("lib/booking-presentation.ts");
  const now = Date.parse("2026-09-10T12:00:00+07:00");
  for (const status of ["cancelled", "expired", "checked_in", "unknown"]) assert.equal(upcomingBooking({ status, startsAt: "2026-09-11T12:00:00+07:00" }, now), false);
  assert.equal(upcomingBooking({ status: "paid", startsAt: "2026-09-09T12:00:00+07:00" }, now), false);
  assert.equal(upcomingBooking({ status: "paid", startsAt: "invalid" }, now), false);
  assert.equal(upcomingBooking({ status: "paid", starts_at: "2026-09-11T12:00:00+07:00" }, now), true);
  assert.equal(bookingStatusLabel("pending_payment"), "รอชำระเงิน");
  assert.equal(bookingStatusLabel("cancelled"), "ยกเลิกแล้ว");
});

test("i18n catalogs cover all three locales with unique keys and matching placeholders", () => {
  const { allMessages, resources, locales } = load("lib/i18n/index.ts");
  assert.equal(new Set(allMessages.map(([key]) => key)).size, allMessages.length, "Duplicate translation key");
  const placeholders = (value) => [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
  for (const [key] of allMessages) {
    for (const locale of locales) {
      const value = resources[locale].translation[key];
      assert.equal(typeof value, "string");
      assert.ok(value.trim(), `${locale}: ${key}`);
      assert.deepEqual(placeholders(value), placeholders(resources.th.translation[key]), `${locale}: ${key}`);
      if (locale !== "th") assert.doesNotMatch(value.replaceAll("฿", ""), /[\u0e00-\u0e7f]/, `${locale}: untranslated Thai in ${key}`);
    }
  }
});

test("i18n changes labels and dates without changing identities, prices or content routing", async () => {
  const { t, memberI18n, localizedContent, isLocale, localeTag, courtName } = load("lib/i18n/index.ts");
  assert.equal(isLocale("en"), true);
  for (const value of ["fr", "../en", "zh-CN", null, {}]) assert.equal(isLocale(value), false);
  await memberI18n.changeLanguage("en");
  assert.equal(t("จองสนาม"), "Book a court");
  assert.equal(localeTag(), "en-GB");
  assert.equal(courtName("สนาม 12"), "Court 12");
  assert.equal(t("BK-12345"), "BK-12345");
  assert.equal(t("ใช้ได้ถึง {{value0}}", { value0: "10 Dec" }), "Valid until 10 Dec");
  const content = { id: 5, title: "ชื่อเดิม", price: 500, targetScreen: "plans", metadata: JSON.stringify({ i18n: { en: { title: "Membership", price: 1, id: 9, targetScreen: "admin" }, zh: { title: "会员套餐" } } }) };
  assert.deepEqual({ ...localizedContent(content), metadata: null }, { ...content, metadata: null, title: "Membership" });
  await memberI18n.changeLanguage("zh");
  assert.equal(t("จองสนาม"), "预约场地");
  assert.equal(localeTag(), "zh-CN");
  assert.equal(localizedContent(content).title, "会员套餐");
  assert.equal(localizedContent({ title: "Original", metadata: "not-json" }).title, "Original");
});

test("member JSX has no untranslated Thai text or hardcoded Thai date locale", () => {
  for (const file of ["components/ppa-app.tsx", "components/booking-calendar.tsx"]) {
    const text = readFileSync(file, "utf8");
    const root = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function walk(node) {
      if (ts.isJsxText(node)) assert.doesNotMatch(node.text.replaceAll("฿", ""), /[\u0e00-\u0e7f]/, `${file}: untranslated JSX`);
      ts.forEachChild(node, walk);
    }
    walk(root);
    assert.doesNotMatch(text, /toLocale(?:DateString|TimeString|String)\("th-TH"/);
  }
});

test("member logout expires session cookies and rejects cross-origin requests", async () => {
  const route = load("app/api/auth/line/route.ts", { "@/lib/auth": {} });
  const response = await route.DELETE(new Request("http://localhost:3000/api/auth/line", { method: "DELETE" }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /ppa_member_session=;/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await route.DELETE(new Request("http://localhost:3000/api/auth/line", { method: "DELETE", headers: { origin: "https://attacker.example" } }))).status, 403);
});

test("password verification rejects invalid hashes without throwing", async () => {
  const passwords = load("lib/password.ts");
  const hash = await passwords.hashPassword("a-long-test-password");
  assert.equal(await passwords.verifyPassword("a-long-test-password", hash), true);
  assert.equal(await passwords.verifyPassword("wrong-password", hash), false);
  assert.equal(await passwords.verifyPassword("a-long-test-password", "scrypt:short:00"), false);
});

function adminHarness() {
  const state = { active: true, passwordHash: "test-password-hash", permissions: ["bookings.manage"], roleCode: "reception" };
  const auth = load("lib/admin-auth.ts", {
    "@/lib/session": session,
    "@/lib/db": { query: async (sql) => sql.includes("FROM admin_staff")
      ? state.active ? [{ id: 7, roleId: 3, roleCode: state.roleCode, passwordHash: state.passwordHash }] : []
      : state.permissions.map((code) => ({ code })) },
  });
  const request = (resource, cookie = auth.createAdminSessionCookie(7, state.passwordHash), method = "GET", extraHeaders = {}) => {
    const { NextRequest } = require("next/server");
    return new NextRequest(`http://localhost:3000/api/admin/${resource}`, { method, headers: { cookie: `ppa_admin_session=${cookie}`, ...extraHeaders } });
  };
  return { state, auth, request };
}

test("admin routes enforce permissions and deny unknown resources", async () => {
  const { auth, request } = adminHarness();
  assert.equal(await auth.assertAdminRequest(request("bookings")), null);
  assert.equal((await auth.assertAdminRequest(request("staff"))).status, 403);
  assert.equal((await auth.assertAdminRequest(request("payments"))).status, 403);
  assert.equal((await auth.assertAdminRequest(request("unregistered"))).status, 403);
  assert.equal((await auth.assertAdminRequest(request("staff", ""))).status, 401);
});

test("suspension, password changes and permission changes take effect on existing cookies", async () => {
  const { state, auth, request } = adminHarness();
  const cookie = auth.createAdminSessionCookie(7, state.passwordHash);
  state.permissions = [];
  assert.equal((await auth.assertAdminRequest(request("bookings", cookie))).status, 403);
  state.active = false;
  assert.equal(await auth.getAdminIdentity(cookie), null);
  state.active = true;
  state.passwordHash = "changed-hash";
  assert.equal(await auth.getAdminIdentity(cookie), null);
});

test("cross-origin admin mutations are denied", async () => {
  const { auth, request } = adminHarness();
  assert.equal((await auth.assertAdminRequest(request("bookings", undefined, "PUT", { origin: "https://attacker.example" }))).status, 403);
});

test("profile cannot modify another staff account", async () => {
  let writes = 0;
  const route = load("app/api/admin/profile/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
    "@/lib/db": { query: async () => { writes++; return []; } },
  });
  const { NextRequest } = require("next/server");
  const response = await route.PUT(new NextRequest("http://localhost:3000/api/admin/profile", {
    method: "PUT", body: JSON.stringify({ staffId: 99, username: "victim", displayName: "Victim" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});

test("catalog ignores client amount and entitlement type", async () => {
  const catalog = load("lib/payment-catalog.ts", { "@/lib/db": { query: async () => [{ title: "Monthly", price: 1900, contentType: "membership_plan" }] } });
  const item = await catalog.resolvePaymentItem({ contentId: 1, amount: 1, itemType: "trainer", itemName: "Annual" });
  assert.deepEqual(item, { amount: 1900, itemName: "Monthly", itemType: "membership" });
  assert.equal(await catalog.resolvePaymentItem({ amount: 1, itemName: "Annual" }), null);
  assert.equal(await catalog.resolvePaymentItem({ contentId: 1, trainerId: 1, trainerPackage: "Monthly" }), null);
});

test("catalog rejects unavailable products and malformed trainer packages", async () => {
  const missing = load("lib/payment-catalog.ts", { "@/lib/db": { query: async () => [] } });
  assert.equal(await missing.resolvePaymentItem({ contentId: 99 }), null);
  const broken = load("lib/payment-catalog.ts", { "@/lib/db": { query: async () => [{ name: "Coach", packages: "invalid" }] } });
  assert.equal(await broken.resolvePaymentItem({ trainerId: 1, trainerPackage: "Monthly" }), null);
});

test("JSON body validation bounds actual streamed bytes", async () => {
  const security = load("lib/security.ts");
  const schema = require("zod").z.object({ title: require("zod").z.string() });
  assert.deepEqual(await security.parseJsonBody(new Request("http://localhost", { method: "POST", body: '{"title":"ok"}' }), schema), { title: "ok" });
  await assert.rejects(security.parseJsonBody(new Request("http://localhost", { method: "POST", body: JSON.stringify({ title: "x".repeat(270000) }) }), schema), security.RequestValidationError);
  await assert.rejects(security.parseJsonBody(new Request("http://localhost", { method: "POST", body: "{" }), schema), security.RequestValidationError);
});

test("duplicate booking payment rolls back before wallet debit", async () => {
  const statements = [];
  let rollback = false;
  const conn = {
    beginTransaction: async () => {}, rollback: async () => { rollback = true; }, release: () => {},
    execute: async (sql) => { statements.push(sql); return [sql.includes("FROM bookings") ? [{ status: "paid", valid: 1 }] : [{ id: 10 }]]; },
  };
  const route = load("app/api/payments/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 1 }) },
    "@/lib/booking-rules": { expirePendingBookings: async () => {} },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => ({ bookingNo: "BK1234", method: "wallet" }) },
    "@/lib/db": { query: async () => [{ id: 1, amount: 100, status: "pending_payment" }], createPublicId: () => "PAY1234", pool: { getConnection: async () => conn } },
  });
  assert.equal((await route.POST(new Request("http://localhost", { method: "POST" }))).status, 409);
  assert.equal(rollback, true);
  assert.equal(statements.some((sql) => sql.includes("wallet_accounts")), false);
});

test("booking ranges reject impossible dates and do not depend on host timezone", () => {
  const rules = load("lib/booking-rules.ts", { "@/lib/db": {} });
  assert.equal(rules.buildSlotRange("2026-02-30", "10:00"), null);
  assert.equal(rules.buildSlotRange("2026-09-10", "22:00", 2), null);
  assert.deepEqual(rules.buildSlotRange("2026-09-10", "10:00", 2), { startsAt: "2026-09-10 10:00:00", endsAt: "2026-09-10 12:00:00" });
});

test("calendar separates elapsed, closed, partial and full dates using Bangkok time", () => {
  const { bangkokToday, datesInMonth, slotStatus, summarizeDay } = load("lib/court-availability.ts");
  const now = Date.parse("2026-09-10T15:30:00+07:00");
  assert.equal(bangkokToday(Date.parse("2026-09-10T18:00:00Z")), "2026-09-11");
  assert.equal(datesInMonth("2028-02").length, 29);
  assert.equal(datesInMonth("2026-02").length, 28);
  assert.deepEqual(datesInMonth("2026-13"), []);
  const bookings = [{ courtId: 1, startsAt: "2026-09-10 17:00:00", endsAt: "2026-09-10 18:00:00" }];
  assert.equal(slotStatus("2026-09-10", "14:00", 1, 1, [], now), "past");
  assert.equal(slotStatus("2026-09-10", "17:00", 1, 1, bookings, now), "full");
  assert.equal(slotStatus("2026-09-10", "17:00", 1, 2, bookings, now), "available");
  assert.equal(slotStatus("2026-09-10", "16:00", 2, 1, bookings, now), "full");
  assert.equal(slotStatus("2026-09-10", "18:00", 1, 1, bookings, now), "available");
  assert.equal(slotStatus("2026-09-10", "22:00", 2, 1, [], now), "closed");
  assert.equal(summarizeDay("2026-09-10", ["past", "full", "available"], now).status, "available");
  assert.equal(summarizeDay("2026-09-10", ["past", "full"], now).status, "full");
  assert.equal(summarizeDay("2026-09-10", ["past"], now).status, "past");
  assert.equal(summarizeDay("2026-09-11", [], now).status, "closed");
});

test("availability API validates dates, reports full months and never writes or returns booking identities", async () => {
  const statements = [];
  const route = load("app/api/courts/availability/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 1 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", secureResponse: (response) => response, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { query: async (sql) => {
      statements.push(sql);
      if (sql.includes("FROM sports")) return [{ id: 1, baseRate: 200 }];
      if (sql.includes("FROM courts")) return [{ id: 1, name: "Court", capacity: 4 }];
      return [{ courtId: 1, startsAt: "2099-02-01 00:00:00", endsAt: "2099-03-01 00:00:00" }];
    } },
  });
  for (const params of ["date=2099-02-30", "month=2099-13", "date=2099-02-01&month=2099-02", "month=2099-02&durationHours=5"]) {
    assert.equal((await route.GET(new Request(`http://localhost/api/courts/availability?sport=badminton&${params}`))).status, 400);
  }
  assert.equal(statements.length, 0);
  const response = await route.GET(new Request("http://localhost/api/courts/availability?sport=badminton&month=2099-02"));
  const body = await response.json();
  assert.equal(body.days.length, 28);
  assert.ok(body.days.every((day) => day.status === "full" && day.availableSlots === 0));
  assert.equal(statements.length, 3);
  assert.ok(statements.every((sql) => sql.startsWith("SELECT")));
  assert.match(statements.at(-1), /expires_at > NOW\(\)/);
  assert.doesNotMatch(JSON.stringify(body), /courtId|startsAt|userId/);
});

test("booking rechecks locked court and rejects overlapping reservations before insert", async () => {
  for (const changedCourt of [false, true]) {
    const statements = [];
    let rolledBack = false;
    const conn = {
      beginTransaction: async () => {}, rollback: async () => { rolledBack = true; }, release: () => {},
      execute: async (sql) => {
        statements.push(sql);
        return [sql.includes("FROM courts") ? changedCourt ? [] : [{ id: 1, capacity: 4, hourlyRate: 200 }] : [{ id: 99 }]];
      },
    };
    const route = load("app/api/bookings/route.ts", {
      "@/lib/auth": { assertApiUser: async () => ({ id: 1 }) },
      "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => ({ sportSlug: "badminton", courtId: 1, date: "2099-02-01", time: "17:00", durationHours: 1, players: 2 }) },
      "@/lib/db": { createPublicId: () => "BKTEST", pool: { getConnection: async () => conn }, query: async (sql) => sql.includes("FROM sports") ? [{ id: 1, requiresBooking: true, baseRate: 200, name: "Badminton" }] : [{ id: 1, capacity: 4, name: "Court" }] },
    });
    assert.equal((await route.POST(new Request("http://localhost/api/bookings", { method: "POST" }))).status, 409);
    assert.ok(rolledBack);
    assert.ok(statements.every((sql) => sql.includes("FOR UPDATE")));
    assert.ok(!statements.some((sql) => sql.includes("INSERT")));
  }
});

test("concurrent booking requests serialize on court lock; only one is inserted at server price", async () => {
  let queue = Promise.resolve();
  let inserted = false;
  let insertCount = 0;
  let id = 0;
  const route = load("app/api/bookings/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 1 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => ({ sportSlug: "badminton", courtId: 1, date: "2099-02-01", time: "17:00", durationHours: 1, players: 2, amount: 1 }) },
    "@/lib/db": {
      createPublicId: (prefix) => `${prefix}${++id}`,
      query: async (sql) => sql.includes("FROM sports") ? [{ id: 1, requiresBooking: true, baseRate: 200, name: "Badminton" }] : [{ id: 1, capacity: 4, name: "Court", hourlyRate: 100 }],
      pool: { getConnection: async () => {
        let unlock = () => {};
        return {
          beginTransaction: async () => {}, commit: async () => unlock(), rollback: async () => unlock(), release: () => {},
          execute: async (sql, params) => {
            if (sql.includes("FROM courts")) {
              const previous = queue;
              queue = new Promise((resolve) => { unlock = resolve; });
              await previous;
              return [[{ id: 1, capacity: 4, hourlyRate: 300 }]];
            }
            if (sql.includes("FOR UPDATE")) return [inserted ? [{ id: 1 }] : []];
            if (sql.startsWith("INSERT")) {
              assert.equal(params[8], 450, "Locked court rate, not client price or pre-lock rate");
              inserted = true;
              insertCount++;
              return [{ affectedRows: 1 }];
            }
            return [[{ booking_no: "BKTEST", amount: 450, status: "pending_payment" }]];
          },
        };
      } },
    },
  });
  const responses = await Promise.all([1, 2].map(() => route.POST(new Request("http://localhost/api/bookings", { method: "POST" }))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(insertCount, 1);
});

test("booking management cannot mark a booking paid", async () => {
  let dbCalled = false;
  const route = load("app/api/admin/bookings/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null },
    "@/lib/db": { transaction: async () => { dbCalled = true; } },
  });
  const { NextRequest } = require("next/server");
  const response = await route.PUT(new NextRequest("http://localhost/api/admin/bookings", { method: "PUT", body: JSON.stringify({ bookingNo: "BK1234", status: "paid" }) }));
  assert.equal(response.status, 400);
  assert.equal(dbCalled, false);
});

test("QR consumption rejects exhausted rights and rolls back token consumption", async () => {
  let rolledBack = false;
  let committed = false;
  const conn = {
    beginTransaction: async () => {}, rollback: async () => { rolledBack = true; }, commit: async () => { committed = true; }, release: () => {},
    execute: async (sql) => {
      if (sql.startsWith("SELECT")) return [[{ id: 1, userId: 2, purpose: "coupon", refId: "3", usedAt: null, expired: 0 }]];
      return [{ affectedRows: sql.includes("UPDATE user_coupons") ? 0 : 1 }];
    },
  };
  const route = load("app/api/admin/qr/verify/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session", hasAdminPermission: () => true },
    "@/lib/db": { pool: { getConnection: async () => conn } },
  });
  const { NextRequest } = require("next/server");
  const response = await route.POST(new NextRequest("http://localhost/api/admin/qr/verify", { method: "POST", body: JSON.stringify({ token: "a".repeat(64), consume: true }) }));
  assert.equal(response.status, 409);
  assert.equal(rolledBack, true);
  assert.equal(committed, false);
});

test("staff managers cannot assign super admin or modify their own account", async () => {
  const policy = load("lib/admin-role-policy.ts", {
    "@/lib/admin-auth": { getAdminIdentity: async () => ({ id: 7, roleId: 2, roleCode: "manager", permissionCodes: ["staff.manage"] }), adminSessionCookieName: () => "session" },
    "@/lib/db": { query: async (sql, params) => [{ code: params[0] === 1 ? "super_admin" : "manager", level: params[0] === 1 ? 100 : 50 }] },
  });
  const { NextRequest } = require("next/server");
  const request = new NextRequest("http://localhost/api/admin/staff");
  assert.equal((await policy.assertRoleAssignment(request, 1)).status, 403);
  assert.equal((await policy.assertRoleAssignment(request, 2, 7)).status, 403);
});
