import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import nextEnv from "@next/env";
import mysql from "mysql2/promise";
import { quoteId, splitDump } from "./lib/db-dump.mjs";

// Proves a backup can be restored: loads it into a scratch database (RESTORE_DB_NAME, never the live
// DB_NAME) and compares every table's row count with the backup's manifest. Run it monthly.
//   npm run db:restore-check -- storage/backups/ppa-YYYYMMDD-HHmm.sql.gz
nextEnv.loadEnvConfig(process.cwd(), false);
const env = process.env;
const fail = (message) => {
  console.error(`Restore check failed: ${message}`);
  process.exit(1);
};
const file = process.argv[2] || "";
const target = env.RESTORE_DB_NAME || "";
// Checked before anything connects: this script drops and recreates every table it restores.
if (!target) fail("set RESTORE_DB_NAME to a scratch database to restore into (never the live DB_NAME).");
if (!/^[A-Za-z0-9_]{1,64}$/.test(target)) fail("RESTORE_DB_NAME may only contain letters, digits and _.");
if (target === env.DB_NAME) fail("RESTORE_DB_NAME is the live database (DB_NAME). Choose a scratch database.");
if (!file.endsWith(".sql.gz")) fail("usage: npm run db:restore-check -- storage/backups/ppa-YYYYMMDD-HHmm.sql.gz");
for (const name of ["DB_HOST", "DB_USER"]) {
  if (!env[name]) fail(`missing ${name}.`);
}

let manifest;
let statements;
try {
  manifest = JSON.parse(await fs.readFile(file.replace(/\.sql\.gz$/, ".json"), "utf8"));
  statements = splitDump(gunzipSync(await fs.readFile(file)).toString("utf8"));
} catch (error) {
  fail(`cannot read the backup or its manifest: ${error instanceof Error ? error.message : error}`);
}
if (!manifest?.tables || typeof manifest.tables !== "object") fail("the manifest has no table counts.");

const connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, charset: "utf8mb4" });
const mismatches = [];
try {
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${quoteId(target)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE ${quoteId(target)}`);
  for (const statement of statements) await connection.query(statement);
  for (const [table, expected] of Object.entries(manifest.tables)) {
    const [[row]] = await connection.query(`SELECT COUNT(*) total FROM ${quoteId(table)}`);
    if (Number(row.total) !== Number(expected)) mismatches.push(`${table}: backup ${expected}, restored ${row.total}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await connection.end().catch(() => {});
}
if (mismatches.length) fail(`row counts differ:\n- ${mismatches.join("\n- ")}`);
const total = Object.values(manifest.tables).reduce((sum, count) => sum + Number(count), 0);
console.log(`Restore check passed: ${Object.keys(manifest.tables).length} tables, ${total} rows restored into ${target}.`);
