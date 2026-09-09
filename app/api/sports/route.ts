import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp, secureResponse } from "@/lib/security";

export async function GET() {
  const limited = checkRateLimit({ key: `sports:${await clientIp()}`, limit: 90, windowMs: 60_000 });
  if (limited) return limited;
  try {
    await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const sports = await query(
    "SELECT id, slug, name_th name, icon, description, requires_booking requiresBooking, base_rate baseRate FROM sports WHERE active = TRUE ORDER BY sort_order",
  );
  return secureResponse(NextResponse.json({ sports }));
}
