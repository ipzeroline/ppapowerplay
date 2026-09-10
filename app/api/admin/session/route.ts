import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionCookieOptions, adminSessionCookieName, createAdminSessionCookie } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { assertSameOrigin, checkRateLimit, jsonError, parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  username: z.string().min(3).max(80),
  password: z.string().min(8).max(200),
});

type LoginRow = {
  id: number;
  passwordHash: string;
};

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = checkRateLimit({ key: `admin-login:${ip}`, limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  let body: z.infer<typeof schema>;
  try {
    body = await parseJsonBody(request, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  const adminRows = await query<LoginRow>(
    "SELECT id, password_hash passwordHash FROM admin_staff WHERE username = ? AND status = 'active' LIMIT 1",
    [body.username],
  );
  const admin = adminRows[0];
  const dummyHash = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
  const passwordOk = await verifyPassword(body.password, admin?.passwordHash || dummyHash);
  if (!admin || !passwordOk) {
    return jsonError("Admin access denied", 401);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName(), createAdminSessionCookie(admin.id, admin.passwordHash), adminSessionCookieOptions());
  return secureResponse(response);
}

export async function DELETE(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName(), "", { ...adminSessionCookieOptions(), maxAge: 0 });
  return response;
}
