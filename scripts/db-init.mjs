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
      const [key, ...rest] = trimmed.split("=");
      process.env[key] ??= rest.join("=");
    }
  } catch {
    // Production should provide real environment variables.
  }
}

await loadLocalEnv();

const env = process.env;
const sqlPath = path.join(process.cwd(), "database", "schema.sql");
const sql = await fs.readFile(sqlPath, "utf8");

const connection = await mysql.createConnection({
  host: env.DB_HOST || "139.59.96.78",
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || "ppaapp_db",
  password: env.DB_PASSWORD || "r-BXY-VTkhBz0E=SlLh+",
  database: env.DB_NAME || "ppaapp_db",
  multipleStatements: true,
  timezone: "+07:00",
  charset: "utf8mb4",
});

try {
  await connection.query(sql);
  console.log("Database schema initialized.");
} finally {
  await connection.end();
}
