import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, secureResponse } from "@/lib/security";

const sessionCookieName = "ppa_admin_session";

export function assertAdminRequest(request: NextRequest) {
  const adminKey = process.env.ADMIN_ACCESS_KEY || "";
  const allowDevOpen = process.env.NODE_ENV !== "production" && !adminKey;
  const providedKey =
    request.headers.get("x-admin-key") || (process.env.NODE_ENV !== "production" ? request.nextUrl.searchParams.get("key") : "") || "";
  const session = request.cookies.get(sessionCookieName)?.value || "";
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = checkRateLimit({ key: `admin:${ip}`, limit: 90, windowMs: 60_000 });
  if (limited) return limited;

  if (allowDevOpen || verifyAdminKey(providedKey) || verifyAdminSession(session)) return null;

  return secureResponse(NextResponse.json({ message: "Admin access denied" }, { status: 401 }));
}

export function createAdminSessionCookie() {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 8;
  const payload = String(expiresAt);
  return `${payload}.${signAdminSession(payload)}`;
}

export function verifyAdminSession(value: string) {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  const expiresAt = Number(payload);
  if (!payload || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  return isSafeEqual(signAdminSession(payload), signature);
}

export function verifyAdminKey(value: string) {
  return isSafeEqual(process.env.ADMIN_ACCESS_KEY || "", value);
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 8,
    path: "/",
  };
}

export function adminSessionCookieName() {
  return sessionCookieName;
}

function isSafeEqual(expected: string, actual: string) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function signAdminSession(payload: string) {
  const secret = process.env.ADMIN_ACCESS_KEY || "";
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}
