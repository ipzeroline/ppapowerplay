import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-auth";
import { isCalendarDate, nextDay } from "@/lib/court-blocks";
import { takenBookingAs } from "@/lib/court-schedule";
import { query } from "@/lib/db";

// One Bangkok day of the court calendar: courts, active bookings (with the guest or member name)
// and active blocks.
export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const date = request.nextUrl.searchParams.get("date") || "";
  if (!isCalendarDate(date)) return NextResponse.json({ message: "วันที่ไม่ถูกต้อง" }, { status: 400 });
  const dayStart = `${date} 00:00:00`;
  const dayEnd = `${nextDay(date)} 00:00:00`;
  const courts = await query("SELECT c.id, c.name, c.sport_id sportId, s.name_th sportName, c.status, c.capacity, c.hourly_rate hourlyRate, s.base_rate baseRate FROM courts c JOIN sports s ON s.id = c.sport_id WHERE c.status <> 'hidden' ORDER BY s.sort_order, c.sort_order, c.id");
  const bookings = await query<Record<string, unknown> & { guest: unknown }>(
    `SELECT b.booking_no bookingNo, b.court_id courtId, DATE_FORMAT(b.starts_at, '%Y-%m-%d %H:%i:%s') startsAt, DATE_FORMAT(b.ends_at, '%Y-%m-%d %H:%i:%s') endsAt, b.status, COALESCE(b.guest_name, u.display_name) name, COALESCE(b.guest_phone, u.phone) phone, b.guest_name IS NOT NULL guest, b.amount, b.title, b.series_key seriesKey, (SELECT p.payment_no FROM payments p WHERE p.booking_id = b.id AND p.status = 'paid' ORDER BY p.id DESC LIMIT 1) paymentNo FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.court_id IS NOT NULL AND b.starts_at >= ? AND b.starts_at < ? AND (${takenBookingAs("b")}) ORDER BY b.starts_at`,
    [dayStart, dayEnd],
  );
  const blocks = await query(
    "SELECT id, court_id courtId, DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') startsAt, DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') endsAt, reason FROM court_blocks WHERE cancelled_at IS NULL AND starts_at < ? AND ends_at > ? ORDER BY starts_at",
    [dayEnd, dayStart],
  );
  return NextResponse.json(
    { date, courts, bookings: bookings.map((row) => ({ ...row, guest: Boolean(Number(row.guest)) })), blocks },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
