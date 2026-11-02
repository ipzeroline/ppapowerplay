import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-auth";
import { loadCashup } from "@/lib/cashup";
import { isCalendarDate } from "@/lib/court-blocks";

// Daily cash-up for one Bangkok day (today when no date is given).
export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const date = request.nextUrl.searchParams.get("date") || new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  if (!isCalendarDate(date)) return NextResponse.json({ message: "วันที่ไม่ถูกต้อง" }, { status: 400 });
  return NextResponse.json(await loadCashup(date), { headers: { "Cache-Control": "private, no-store" } });
}
