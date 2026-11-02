import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import nextEnv from "@next/env";
import mysql from "mysql2/promise";
import { dumpFooter, dumpHeader, insertStatements, quoteId } from "./lib/db-dump.mjs";

// Daily logical backup (cron, see README): every table's definition and rows from one consistent
// snapshot, gzipped to BACKUP_DIR (default storage/backups) as ppa-YYYYMMDD-HHmm.sql.gz (Bangkok time)
// with a .json manifest of row counts for npm run db:restore-check. Keeps BACKUP_KEEP_DAYS (default 14).
nextEnv.loadEnvConfig(process.cwd(), false);
const env = process.env;
const fail = (message) => {
  console.error(`Backup failed: ${message}`);
  process.exit(1);
};
for (const name of ["DB_HOST", "DB_USER", "DB_NAME"]) {
  if (!env[name]) fail(`missing ${name}. Configure .env.production.local / .env.local or the deployment environment.`);
}
const keepDays = Number(env.BACKUP_KEEP_DAYS || 14);
if (!Number.isInteger(keepDays) || keepDays < 1) fail("BACKUP_KEEP_DAYS must be a whole number of days, 1 or more");

const dir = path.resolve(env.BACKUP_DIR || "storage/backups");
const stamp = new Date(Date.now() + 7 * 3_600_000).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);
const file = path.join(dir, `ppa-${stamp}.sql.gz`);
const partial = `${file}.partial`;
const manifestFile = file.replace(/\.sql\.gz$/, ".json");
await fs.mkdir(dir, { recursive: true, mode: 0o700 });

const connection = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: "utf8mb4",
  // Values exactly as stored: dates as text, big numbers as text, JSON as its text.
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  typeCast: (field, next) => (field.type === "JSON" ? field.string() : next()),
});

const counts = {};
try {
  await connection.query("SET time_zone = '+00:00'");
  await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  const [tables] = await connection.query("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");

  async function* dump() {
    yield dumpHeader();
    for (const { name } of tables) {
      const [[created]] = await connection.query(`SHOW CREATE TABLE ${quoteId(name)}`);
      yield `DROP TABLE IF EXISTS ${quoteId(name)};\n${created["Create Table"]};\n`;
      const [columnRows] = await connection.query("SELECT COLUMN_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND EXTRA NOT LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION", [name]);
      const columns = columnRows.map((row) => row.name);
      const [keyRows] = await connection.query("SELECT COLUMN_NAME name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [name]);
      const order = (keyRows.length ? keyRows.map((row) => row.name) : columns).map(quoteId).join(", ");
      counts[name] = 0;
      for (let offset = 0; ; offset += 1000) {
        const [rows] = await connection.query({ sql: `SELECT ${columns.map(quoteId).join(", ")} FROM ${quoteId(name)} ORDER BY ${order} LIMIT 1000 OFFSET ${offset}`, rowsAsArray: true });
        counts[name] += rows.length;
        for (const statement of insertStatements(name, columns, rows, mysql.escape)) yield `${statement}\n`;
        if (rows.length < 1000) break;
      }
    }
    yield dumpFooter();
  }

  await pipeline(Readable.from(dump()), createGzip({ level: 9 }), createWriteStream(partial, { mode: 0o600 }));
  await connection.query("COMMIT");
  await fs.rename(partial, file);
} catch (error) {
  await fs.rm(partial, { force: true });
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await connection.end().catch(() => {});
}

const { size } = await fs.stat(file);
await fs.writeFile(manifestFile, `${JSON.stringify({ file: path.basename(file), createdAt: new Date().toISOString(), database: env.DB_NAME, bytes: size, tables: counts }, null, 2)}\n`, { mode: 0o600 });

// Retention: only this script's own files, by age.
const cutoff = Date.now() - keepDays * 86_400_000;
let removed = 0;
for (const entry of await fs.readdir(dir)) {
  if (!/^ppa-\d{8}-\d{4}\.sql\.gz$/.test(entry)) continue;
  const full = path.join(dir, entry);
  if ((await fs.stat(full)).mtimeMs >= cutoff) continue;
  await fs.rm(full);
  await fs.rm(full.replace(/\.sql\.gz$/, ".json"), { force: true });
  removed += 1;
}
const rows = Object.values(counts).reduce((total, count) => total + count, 0);
console.log(`Backup written: ${file} (${Object.keys(counts).length} tables, ${rows} rows, ${size} bytes). Removed ${removed} older than ${keepDays} days. Copy it off this server.`);
