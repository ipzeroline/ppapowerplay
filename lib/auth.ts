import "server-only";
import { randomUUID } from "node:crypto";
import type mysql from "mysql2/promise";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";

export type CurrentUser = {
  id: number;
  lineUserId: string;
  displayName: string;
  memberCode: string;
};

type LineVerifyResponse = {
  sub?: string;
  name?: string;
  picture?: string;
  aud?: string;
  error?: string;
  error_description?: string;
};

type VerifiedLineProfile = LineVerifyResponse & { sub: string };

export class ApiUnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ApiUnauthorizedError";
  }
}

export function isLineRequired() {
  return process.env.APP_REQUIRE_LINE === "true" || process.env.NEXT_PUBLIC_REQUIRE_LINE === "true" || process.env.NODE_ENV === "production";
}

export function authErrorResponse(error: unknown) {
  if (error instanceof ApiUnauthorizedError) {
    return NextResponse.json({ message: "กรุณาเปิดผ่าน LINE เท่านั้น" }, { status: 401 });
  }
  throw error;
}

async function verifyLineIdToken(idToken: string): Promise<VerifiedLineProfile> {
  if (isLineRequired() && !process.env.LINE_CHANNEL_ID) {
    throw new Error("LINE_CHANNEL_ID is required when LINE-only mode is enabled");
  }
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: process.env.LINE_CHANNEL_ID || "",
  });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json()) as LineVerifyResponse;
  if (!res.ok || !data.sub) {
    throw new ApiUnauthorizedError(data.error_description || data.error || "Invalid LINE token");
  }
  if (process.env.LINE_CHANNEL_ID && data.aud && data.aud !== process.env.LINE_CHANNEL_ID) {
    throw new ApiUnauthorizedError("LINE token audience does not match this channel");
  }
  return data as VerifiedLineProfile;
}

export async function getOrCreateUserFromLineToken(idToken: string) {
  const profile = await verifyLineIdToken(idToken);
  const lineUserId = profile.sub;
  const displayName = profile.name || "PPA Member";
  const pictureUrl = profile.picture || null;
  return transaction(async (connection) => {
    const existing = await selectUserByLineId(connection, lineUserId);
    if (existing) {
      await connection.execute(
        "UPDATE users SET picture_url = COALESCE(?, picture_url), status = IF(status = 'deleted', 'active', status) WHERE id = ?",
        [pictureUrl, existing.id],
      );
      await ensureWalletAccount(connection, existing.id, 0, 0, 0);
      return existing;
    }

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          await connection.execute(
            "INSERT INTO users (line_user_id, display_name, picture_url, member_code) VALUES (?, ?, ?, ?)",
            [lineUserId, displayName, pictureUrl, createMemberCode()],
          );
          break;
        } catch (error) {
          if (getMysqlCode(error) !== "ER_DUP_ENTRY") throw error;
          const concurrentUser = await selectUserByLineId(connection, lineUserId);
          if (concurrentUser) {
            await ensureWalletAccount(connection, concurrentUser.id, 0, 0, 0);
            return concurrentUser;
          }
          if (attempt >= 7) throw error;
        }
      }
    } catch (error) {
      const concurrentUser = getMysqlCode(error) === "ER_DUP_ENTRY" ? await selectUserByLineId(connection, lineUserId) : null;
      if (!concurrentUser) throw error;
      await ensureWalletAccount(connection, concurrentUser.id, 0, 0, 0);
      return concurrentUser;
    }

    const created = await selectUserByLineId(connection, lineUserId);
    if (!created) throw new Error("Failed to create LINE user");
    await ensureWalletAccount(connection, created.id, 0, 0, 0);
    return created;
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const lineUserId = cookieStore.get("ppa_line_user_id")?.value;
  const devLineUserId = !isLineRequired() && process.env.NODE_ENV !== "production" ? "dev-line-user" : "";
  const lookup = lineUserId || devLineUserId;
  if (!lookup) return null;

  const rows = await query<CurrentUser>(
    "SELECT id, line_user_id lineUserId, display_name displayName, member_code memberCode FROM users WHERE line_user_id = ? LIMIT 1",
    [lookup],
  );
  if (rows[0]) return rows[0];
  if (process.env.NODE_ENV === "production") return null;

  await query(
    "INSERT INTO users (line_user_id, display_name, member_code, avatar_tier) VALUES (?, 'PPA Member', 'PPA-DEV', 'พอตัว')",
    [lookup],
  );
  const created = await query<CurrentUser>(
    "SELECT id, line_user_id lineUserId, display_name displayName, member_code memberCode FROM users WHERE line_user_id = ? LIMIT 1",
    [lookup],
  );
  await query("INSERT IGNORE INTO wallet_accounts (user_id, balance, coin_balance, point_balance) VALUES (?, 2350, 24, 1200)", [
    created[0].id,
  ]);
  return created[0];
}

export async function assertApiUser() {
  const headerStore = await headers();
  const auth = headerStore.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return getOrCreateUserFromLineToken(auth.slice("Bearer ".length));
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new ApiUnauthorizedError();
  }
  return user;
}

async function selectUserByLineId(connection: mysql.PoolConnection, lineUserId: string) {
  const [rows] = await connection.execute(
    "SELECT id, line_user_id lineUserId, display_name displayName, member_code memberCode FROM users WHERE line_user_id = ? LIMIT 1 FOR UPDATE",
    [lineUserId],
  );
  return (rows as CurrentUser[])[0] || null;
}

async function ensureWalletAccount(
  connection: mysql.PoolConnection,
  userId: number,
  balance: number,
  coinBalance: number,
  pointBalance: number,
) {
  await connection.execute(
    "INSERT IGNORE INTO wallet_accounts (user_id, balance, coin_balance, point_balance) VALUES (?, ?, ?, ?)",
    [userId, balance, coinBalance, pointBalance],
  );
}

function createMemberCode() {
  return `PPA-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function getMysqlCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}
