import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp, secureResponse } from "@/lib/security";

export async function GET() {
  const limited = checkRateLimit({ key: `coupons:${await clientIp()}`, limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  try {
    await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const coupons = await query(
    "SELECT id, code, name, category, price, total_uses totalUses, validity_days validityDays FROM coupons WHERE active = TRUE ORDER BY id",
  );
  return secureResponse(NextResponse.json({ coupons }));
}
