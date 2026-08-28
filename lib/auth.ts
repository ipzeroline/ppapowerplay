import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

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

async function verifyLineIdToken(idToken: string) {
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
  return data;
}

export async function getOrCreateUserFromLineToken(idToken: string) {
  const profile = await verifyLineIdToken(idToken);
  const rows = await query<CurrentUser>(
    "SELECT id, line_user_id lineUserId, display_name displayName, member_code memberCode FROM users WHERE line_user_id = ? LIMIT 1",
    [profile.sub],
  );
  if (rows[0]) return rows[0];

  const memberCode = `PPA-${Math.floor(Math.random() * 900000 + 100000)}`;
  await query(
    "INSERT INTO users (line_user_id, display_name, picture_url, member_code) VALUES (?, ?, ?, ?)",
    [profile.sub, profile.name || "PPA Member", profile.picture || null, memberCode],
  );
  const created = await query<CurrentUser>(
    "SELECT id, line_user_id lineUserId, display_name displayName, member_code memberCode FROM users WHERE line_user_id = ? LIMIT 1",
    [profile.sub],
  );
  await query("INSERT IGNORE INTO wallet_accounts (user_id, balance, coin_balance, point_balance) VALUES (?, 0, 0, 0)", [
    created[0].id,
  ]);
  return created[0];
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
