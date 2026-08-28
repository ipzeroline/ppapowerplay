import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const coupons = await query(
    "SELECT id, code, name, category, price, total_uses totalUses, validity_days validityDays FROM coupons WHERE active = TRUE ORDER BY id",
  );
  return NextResponse.json({ coupons });
}
