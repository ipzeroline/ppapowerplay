import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, getOrCreateUserFromLineToken } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { assertSameOrigin, secureResponse, checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ idToken: z.string().min(20).max(8192) });

export async function DELETE(req: Request) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;
  const response = secureResponse(NextResponse.json({ ok: true }));
  for (const name of ["ppa_member_session", "ppa_line_user_id"]) {
    response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
  }
  return response;
}

export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `auth-line:${await clientIp()}`, limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    const payload = await parseJsonBody(req, schema);
    user = await getOrCreateUserFromLineToken(payload.idToken);
  } catch (error) {
    try {
      return validationErrorResponse(error);
    } catch {
      // Continue to LINE auth handling below.
    }
    return authErrorResponse(error);
  }
  const res = NextResponse.json({ user });
  res.cookies.set("ppa_member_session", signSession("member", user.lineUserId, 60 * 60 * 24 * 30), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
