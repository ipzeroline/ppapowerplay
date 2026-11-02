import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionCookieName, assertAdminRequest, getAdminIdentity } from "@/lib/admin-auth";
import { createPublicId, pool, query, transaction } from "@/lib/db";
import { buildSlotRange, expirePendingBookings, isPastSlot, rateForSlot } from "@/lib/booking-rules";
import { counterBookingSchema, weeklyDates, type CounterBooking } from "@/lib/counter-booking";
import { courtConflict } from "@/lib/court-schedule";
import { notifyMember, pushAfterResponse, pushText } from "@/lib/notify";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";
import { WALK_IN_LINE_ID, walkInUserId } from "@/lib/walk-in";

type CourtRow = { id: number; name: string; capacity: number; hourlyRate: number | null; status: string; sportId: number; sportName: string; baseRate: number };
type Created = { bookingNo: string; startsAt: string; endsAt: string; amount: number; status: string };
type Skipped = { date: string; reason: "booked" | "blocked" | "past" | "closed" };

const statusSchema = z.object({
  bookingNo: z.string().trim().min(4).max(32),
  status: z.enum(["hold", "pending_payment", "paid", "checked_in", "cancelled", "expired"]),
  reason: z.string().trim().max(255).optional().or(z.literal("")),
});

export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;

  await expirePendingBookings();
  return NextResponse.json({ bookings: await loadBookings() });
}

// Counter booking by staff (court calendar): a member or a walk-in guest, one slot or the same slot
// every week. Pay now records one paid payment per booking; pay later holds the court (no expiry)
// until staff take the payment. Each week is checked under the court lock and skipped when taken.
export async function POST(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const admin = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return NextResponse.json({ message: "Admin access denied" }, { status: 401 });
  let input: CounterBooking;
  try {
    input = await parseJsonBody(request, counterBookingSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  const conn = await pool.getConnection();
  const stop = async (body: Record<string, unknown>, status: number) => {
    await conn.rollback();
    return NextResponse.json(body, { status });
  };
  try {
    await conn.beginTransaction();
    const [courtRows] = await conn.execute(
      "SELECT c.id, c.name, c.capacity, c.hourly_rate hourlyRate, c.status, s.id sportId, s.name_th sportName, s.base_rate baseRate FROM courts c JOIN sports s ON s.id = c.sport_id WHERE c.id = ? FOR UPDATE",
      [input.courtId],
    );
    const court = (courtRows as CourtRow[])[0];
    if (!court || court.status !== "available") return await stop({ message: "สนามนี้ไม่เปิดให้จอง" }, 409);
    if (input.players > Number(court.capacity)) return await stop({ message: "จำนวนผู้เล่นเกินความจุสนาม" }, 409);

    // Same request again (lost response, double click): answer with what it made.
    const [replayRows] = await conn.execute(
      "SELECT booking_no bookingNo, DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') startsAt, DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') endsAt, amount, status FROM bookings WHERE series_key = ? ORDER BY starts_at",
      [input.requestId],
    );
    if ((replayRows as Created[]).length) return await stop({ created: replayRows, skipped: [], replayed: true }, 200);

    let userId: number;
    const guest = input.customer.kind === "guest" ? input.customer : null;
    if (input.customer.kind === "member") {
      const [memberRows] = await conn.execute("SELECT id, status, display_name displayName, line_user_id lineUserId FROM users WHERE id = ? LIMIT 1", [input.customer.userId]);
      const member = (memberRows as { id: number; status: string; lineUserId: string }[])[0];
      if (!member || member.lineUserId === WALK_IN_LINE_ID) return await stop({ message: "ไม่พบสมาชิก" }, 404);
      if (member.status !== "active") return await stop({ message: "สมาชิกนี้ไม่ได้อยู่ในสถานะใช้งาน" }, 409);
      userId = member.id;
    } else {
      userId = await walkInUserId(conn);
    }

    const title = `${court.sportName} - ${court.name}`;
    const created: Created[] = [];
    const skipped: Skipped[] = [];
    for (const [index, date] of weeklyDates(input.date, input.repeatWeeks).entries()) {
      const range = buildSlotRange(date, input.time, input.durationHours);
      if (!range) { skipped.push({ date, reason: "closed" }); continue; }
      if (isPastSlot(date, input.time)) { skipped.push({ date, reason: "past" }); continue; }
      const conflict = await courtConflict(conn, court.id, range.startsAt, range.endsAt);
      if (conflict) { skipped.push({ date, reason: conflict }); continue; }
      const amount = rateForSlot(Number(court.baseRate), input.time, input.durationHours, court.hourlyRate);
      const bookingNo = createPublicId("BK");
      const status = input.payNow ? "paid" : "pending_payment";
      const [result] = await conn.execute(
        "INSERT INTO bookings (booking_no, user_id, guest_name, guest_phone, sport_id, court_id, title, starts_at, ends_at, players, amount, status, qr_secret, expires_at, series_key, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
        [bookingNo, userId, guest?.name ?? null, guest?.phone ?? null, court.sportId, court.id, title, range.startsAt, range.endsAt, input.players, amount, status, createPublicId("QR"), input.requestId, admin.id],
      );
      if (input.payNow) {
        const metadata = { itemName: title, itemType: "booking", channel: "counter", soldBy: admin.id, ...(guest ? { guestName: guest.name, guestPhone: guest.phone } : {}), ...(input.note ? { note: input.note } : {}) };
        await conn.execute(
          "INSERT INTO payments (payment_no, user_id, booking_id, method, amount, status, provider_ref, request_id, metadata, paid_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, NOW())",
          [createPublicId("PAY"), userId, Number((result as { insertId?: number }).insertId || 0), input.payNow.method, amount, createPublicId("REF"), `${input.requestId}-${index}`, JSON.stringify(metadata)],
        );
      }
      created.push({ bookingNo, startsAt: range.startsAt, endsAt: range.endsAt, amount, status });
    }
    if (!created.length) return await stop({ message: "ช่วงเวลาที่เลือกไม่ว่าง", skipped }, 409);

    const body = `${title} · ${created.map((row) => slotLabel(row.startsAt)).join(", ")}`;
    if (!guest) await notifyMember(conn, userId, "จองสนามจากเคาน์เตอร์", body);
    await conn.execute(
      "INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'booking.create', 'booking', ?, ?)",
      [admin.id, created[0].bookingNo, JSON.stringify({ count: created.length, skipped: skipped.length, method: input.payNow?.method ?? null, guest: Boolean(guest), seriesKey: input.requestId })],
    );
    await conn.commit();
    if (!guest) pushAfterResponse(userId, pushText("จองสนามจากเคาน์เตอร์", body));
    return NextResponse.json({ created, skipped, bookings: await loadBookings() }, { status: 201 });
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

// "2 ก.พ. 18:00" in Bangkok time, for the member's notice.
function slotLabel(startsAt: string) {
  return new Date(`${startsAt.replace(" ", "T")}+07:00`).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export async function PUT(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof statusSchema>;
  try {
    body = await parseJsonBody(request, statusSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  if (body.status === "paid") return NextResponse.json({ message: "กรุณายืนยันผ่านรายการชำระเงิน" }, { status: 400 });
  const failure = await transaction(async (connection) => {
    const [rows] = await connection.execute("SELECT id, status FROM bookings WHERE booking_no = ? LIMIT 1 FOR UPDATE", [body.bookingNo]);
    const booking = (rows as { id: number; status: string }[])[0];
    if (!booking) return NextResponse.json({ message: "ไม่พบรายการจอง" }, { status: 404 });
    if (!canTransition(booking.status, body.status)) return NextResponse.json({ message: "เปลี่ยนสถานะรายการนี้ไม่ได้" }, { status: 409 });
    await connection.execute(
      "UPDATE bookings SET status = ?, cancelled_at = IF(? = 'cancelled', NOW(), cancelled_at), cancel_reason = IF(? = 'cancelled', ?, cancel_reason), checked_in_at = IF(? = 'checked_in', NOW(), checked_in_at) WHERE id = ?",
      [body.status, body.status, body.status, body.reason || "admin cancelled", body.status, booking.id],
    );
    await connection.execute("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('booking.status', 'bookings', ?, JSON_OBJECT('fromStatus', ?, 'toStatus', ?, 'reason', ?))", [
      body.bookingNo, booking.status, body.status, body.reason || null,
    ]);
    return null;
  });
  if (failure) return failure;
  return GET(request);
}

function loadBookings() {
  return query(
    "SELECT b.id, b.booking_no bookingNo, b.title, COALESCE(b.guest_name, u.display_name) displayName, b.guest_phone guestPhone, s.name_th sportName, c.name courtName, b.starts_at startsAt, b.ends_at endsAt, b.players, b.amount, b.status, b.expires_at expiresAt, b.cancel_reason cancelReason, b.checked_in_at checkedInAt FROM bookings b JOIN users u ON u.id = b.user_id JOIN sports s ON s.id = b.sport_id LEFT JOIN courts c ON c.id = b.court_id ORDER BY b.starts_at DESC LIMIT 200",
  );
}

function canTransition(from: string, to: string) {
  if (from === to) return true;
  if (["cancelled", "expired", "checked_in"].includes(from)) return false;
  if (to === "checked_in") return from === "paid";
  if (to === "paid") return ["hold", "pending_payment"].includes(from);
  if (to === "cancelled") return true;
  return ["hold", "pending_payment"].includes(from) && ["hold", "pending_payment", "expired"].includes(to);
}
