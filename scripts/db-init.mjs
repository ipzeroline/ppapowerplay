import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import mysql from "mysql2/promise";

// Same env files and precedence as the app: shell variables, then .env.production.local,
// .env.local, .env.production and .env.
nextEnv.loadEnvConfig(process.cwd(), false);

const env = process.env;
const sqlPath = path.join(process.cwd(), "database", "schema.sql");
const sql = await fs.readFile(sqlPath, "utf8");

// Credentials come only from the environment (an env file above or the host secret store).
for (const name of ["DB_HOST", "DB_USER", "DB_NAME"]) {
  if (!env[name]) throw new Error(`Missing ${name}. Configure .env.production.local / .env.local or the deployment environment.`);
}

const connection = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
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
