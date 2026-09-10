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
