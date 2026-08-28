import "server-only";
import mysql from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var ppaPool: mysql.Pool | undefined;
}

export const pool =
  global.ppaPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    timezone: "+07:00",
    charset: "utf8mb4",
    decimalNumbers: true,
  });

if (process.env.NODE_ENV !== "production") {
  global.ppaPool = pool;
}

// mysql2 exposes a broad recursive value union; keep this wrapper permissive at the driver boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T>(sql: string, params: any[] = []) {
  const attempts = isReadQuery(sql) ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows as T[];
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= attempts) break;
      await wait(120 * attempt);
    }
  }

  throw lastError;
}

export async function transaction<T>(work: (connection: mysql.PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function createPublicId(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${stamp}${rnd}`;
}

function isReadQuery(sql: string) {
  return /^(select|show|describe|explain)\b/i.test(sql.trim());
}

function isTransientDbError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  return ["ECONNRESET", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "EPIPE"].includes(code);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
