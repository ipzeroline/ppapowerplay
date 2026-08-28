import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const sports = await query(
    "SELECT id, slug, name_th name, icon, description, requires_booking requiresBooking, base_rate baseRate FROM sports WHERE active = TRUE ORDER BY sort_order",
  );
  return NextResponse.json({ sports });
}
