import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

async function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env.local");
  try {
    const raw = await fs.readFile(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      process.env[trimmed.slice(0, index)] ??= trimmed.slice(index + 1);
    }
  } catch {
    // Production should provide real environment variables.
  }
}

await loadLocalEnv();

const env = process.env;
const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
}

check("APP_BASE_URL uses HTTPS", /^https:\/\/[^/]+/.test(env.APP_BASE_URL || ""), env.APP_BASE_URL || "missing");
check("LINE-only server flag enabled", env.APP_REQUIRE_LINE === "true");
check("LINE-only client flag enabled", env.NEXT_PUBLIC_REQUIRE_LINE === "true");
check("LINE LIFF ID configured", Boolean(env.NEXT_PUBLIC_LINE_LIFF_ID));
check("LINE Channel ID configured", Boolean(env.LINE_CHANNEL_ID));
check(
  "LIFF ID belongs to configured LINE Channel",
  Boolean(env.NEXT_PUBLIC_LINE_LIFF_ID && env.LINE_CHANNEL_ID && env.NEXT_PUBLIC_LINE_LIFF_ID.startsWith(`${env.LINE_CHANNEL_ID}-`)),
);
check("Admin key configured", Boolean(env.ADMIN_ACCESS_KEY));
check("Admin key length >= 32", (env.ADMIN_ACCESS_KEY || "").length >= 32);
check("LINE access token configured outside public env", Boolean(env.LINE_CHANNEL_ACCESS_TOKEN) && !Object.keys(env).some((key) => key.startsWith("NEXT_PUBLIC_") && key.includes("TOKEN")));

let connection;
try {
  connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    timezone: "+07:00",
    charset: "utf8mb4",
  });

  const [dbRows] = await connection.query("SELECT 1 ok");
  check("Database connection", Number(dbRows[0]?.ok) === 1);

  const [indexRows] = await connection.query(`
    SELECT table_name tableName, index_name indexName, non_unique nonUnique
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND index_name IN (
        'uq_users_line_user_id',
        'uq_users_member_code',
        'uq_wallet_user',
        'uq_bookings_no',
        'uq_payments_no',
        'uq_admin_staff_username'
      )
  `);
  const indexSet = new Set(indexRows.map((row) => row.indexName));
  for (const name of ["uq_users_line_user_id", "uq_users_member_code", "uq_wallet_user", "uq_bookings_no", "uq_payments_no", "uq_admin_staff_username"]) {
    check(`Database unique index ${name}`, indexSet.has(name));
  }

  const [staffRows] = await connection.query("SELECT COUNT(*) total FROM admin_staff WHERE status = 'active'");
  check("At least one active admin staff", Number(staffRows[0]?.total || 0) > 0);

  const [roleRows] = await connection.query("SELECT COUNT(*) total FROM admin_roles WHERE code = 'super_admin'");
  check("Super admin role exists", Number(roleRows[0]?.total || 0) > 0);
} catch (error) {
  check("Database audit", false, error.message);
} finally {
  if (connection) await connection.end();
}

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
  if (!item.ok) failed += 1;
}

if (failed) {
  console.error(`Production hardening audit failed: ${failed} check(s) need attention.`);
  process.exit(1);
}

console.log("Production hardening audit passed.");
