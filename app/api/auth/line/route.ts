import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, getOrCreateUserFromLineToken } from "@/lib/auth";

const schema = z.object({ idToken: z.string().min(20) });

export async function POST(req: Request) {
  const payload = schema.parse(await req.json());
  let user;
  try {
    user = await getOrCreateUserFromLineToken(payload.idToken);
  } catch (error) {
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
