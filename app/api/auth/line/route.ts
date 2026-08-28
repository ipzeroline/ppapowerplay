import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, getOrCreateUserFromLineToken } from "@/lib/auth";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ idToken: z.string().min(20) });

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
  res.cookies.set("ppa_line_user_id", user.lineUserId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
