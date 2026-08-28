import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionCookieOptions, adminSessionCookieName, createAdminSessionCookie, verifyAdminKey } from "@/lib/admin-auth";
import { checkRateLimit, jsonError, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ key: z.string().min(20).max(200) });

export async function POST(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = checkRateLimit({ key: `admin-login:${ip}`, limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  let body: z.infer<typeof schema>;
  try {
    body = await parseJsonBody(request, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  if (!verifyAdminKey(body.key)) {
    return jsonError("Admin access denied", 401);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName(), createAdminSessionCookie(), adminSessionCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName(), "", { ...adminSessionCookieOptions(), maxAge: 0 });
  return response;
}
