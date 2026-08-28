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
const connection = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  timezone: "+07:00",
  charset: "utf8mb4",
});

const checks = [
  {
    name: "Unique index on users.line_user_id",
    sql: `
      SELECT COUNT(*) total
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND index_name = 'uq_users_line_user_id'
        AND non_unique = 0
    `,
    ok: (rows) => Number(rows[0]?.total || 0) > 0,
  },
  {
    name: "Unique index on users.member_code",
    sql: `
      SELECT COUNT(*) total
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND index_name = 'uq_users_member_code'
        AND non_unique = 0
    `,
    ok: (rows) => Number(rows[0]?.total || 0) > 0,
  },
  {
    name: "Duplicate LINE user IDs",
    sql: "SELECT line_user_id, COUNT(*) total FROM users GROUP BY line_user_id HAVING COUNT(*) > 1 LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Duplicate member codes",
    sql: "SELECT member_code, COUNT(*) total FROM users GROUP BY member_code HAVING COUNT(*) > 1 LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Blank LINE user IDs",
    sql: "SELECT id FROM users WHERE line_user_id IS NULL OR TRIM(line_user_id) = '' LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Users missing wallet accounts",
    sql: `
      SELECT u.id, u.member_code
      FROM users u
      LEFT JOIN wallet_accounts w ON w.user_id = u.id
      WHERE u.status <> 'deleted' AND w.id IS NULL
      LIMIT 20
    `,
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Duplicate wallet accounts",
    sql: "SELECT user_id, COUNT(*) total FROM wallet_accounts GROUP BY user_id HAVING COUNT(*) > 1 LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Orphan bookings",
    sql: "SELECT b.id FROM bookings b LEFT JOIN users u ON u.id = b.user_id WHERE u.id IS NULL LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Orphan payments",
    sql: "SELECT p.id FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Orphan memberships",
    sql: "SELECT m.id FROM memberships m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Orphan user coupons",
    sql: "SELECT uc.id FROM user_coupons uc LEFT JOIN users u ON u.id = uc.user_id WHERE u.id IS NULL LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
  {
    name: "Orphan notifications",
    sql: "SELECT n.id FROM notifications n LEFT JOIN users u ON u.id = n.user_id WHERE u.id IS NULL LIMIT 20",
    ok: (rows) => rows.length === 0,
  },
];

try {
  let failed = 0;
  for (const check of checks) {
    const [rows] = await connection.query(check.sql);
    const ok = check.ok(rows);
    console.log(`${ok ? "PASS" : "FAIL"} ${check.name}${ok ? "" : `: ${JSON.stringify(rows)}`}`);
    if (!ok) failed += 1;
  }

  if (failed) {
    console.error(`LINE identity audit failed: ${failed} check(s) need attention.`);
    process.exit(1);
  }

  console.log("LINE identity audit passed: customer identity is stable by LINE user ID.");
} finally {
  await connection.end();
}
