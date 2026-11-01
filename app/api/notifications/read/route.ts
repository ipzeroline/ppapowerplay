import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, checkRateLimit, clientIp } from "@/lib/security";

// Marks the signed-in member's notifications as read (called when the list is opened).
export async function POST(req: Request) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const limited = checkRateLimit({ key: `notifications-read:${await clientIp()}`, limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  await query("UPDATE notifications SET status = 'read' WHERE user_id = ? AND status = 'unread'", [user.id]);
  return NextResponse.json({ ok: true });
}
