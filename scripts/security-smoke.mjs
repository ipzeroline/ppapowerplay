import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Smoke tests must target localhost");

async function check(route, expected, init = {}) {
  const start = performance.now();
  const response = await fetch(`${base}${route}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, expected, `${route}: expected ${expected}, received ${response.status}`);
  const body = await response.text();
  console.log(`PASS ${init.method || "GET"} ${route.split("?")[0]} ${response.status} ${Math.round(performance.now() - start)}ms`);
  return { response, body };
}

for (const resource of ["bookings", "content", "coupons", "courts", "roles", "staff", "trainers"]) {
  const { response } = await check(`/api/admin/${resource}`, 401);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
}
await check("/api/admin/session", 403, { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}" });
await check("/api/admin/session", 400, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
await check("/api/admin/session", 401, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "nonexistent-smoke-user", password: "not-a-valid-password" }) });
const login = await check("/AdminConsole", 200);
assert.match(login.body, /autoComplete="username"/);
assert.match(login.body, /autoComplete="current-password"/);
await check("/api/bootstrap", 401, { headers: { cookie: "ppa_line_user_id=forged-member; ppa_member_session=forged-session" } });

const connection = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectTimeout: 10_000,
});
try {
  const [staff] = await connection.execute("SELECT s.id, s.password_hash passwordHash, r.code roleCode FROM admin_staff s JOIN admin_roles r ON r.id = s.role_id WHERE s.status = 'active'");
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_ACCESS_KEY;
  assert.ok(secret?.length >= 32, "Local session signing secret required");
  for (const admin of staff) {
    const version = createHash("sha256").update(admin.passwordHash).digest("hex");
    const payload = Buffer.from(JSON.stringify({ subject: `${admin.id}:${version}`, expiresAt: Date.now() + 60_000 })).toString("base64url");
    const signature = createHmac("sha256", secret).update(`admin:${payload}`).digest("hex");
    const headers = { cookie: `ppa_admin_session=${payload}.${signature}` };
    const [permissions] = await connection.execute("SELECT p.code FROM admin_permissions p JOIN admin_role_permissions rp ON rp.permission_id = p.id JOIN admin_staff s ON s.role_id = rp.role_id WHERE s.id = ?", [admin.id]);
    const canReadStaff = admin.roleCode === "super_admin" || permissions.some((p) => p.code === "staff.manage");
    const result = await check("/api/admin/staff", canReadStaff ? 200 : 403, { headers });
    assert.doesNotMatch(result.body, /passwordHash|password_hash|scrypt:/);
    if (admin.roleCode === "super_admin") {
      const page = await check("/AdminConsole", 200, { headers });
      assert.doesNotMatch(page.body, /scrypt:/);
    }
    await check("/api/admin/profile", 403, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ staffId: admin.id + 1000000, username: "no-change-smoke", displayName: "No change" }) });
  }
} finally {
  await connection.end();
}
console.log("Read-only HTTP security smoke passed; no data was changed.");
