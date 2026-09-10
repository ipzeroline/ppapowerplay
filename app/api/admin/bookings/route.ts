import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query, transaction } from "@/lib/db";
import { expirePendingBookings } from "@/lib/booking-rules";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

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
    "SELECT b.id, b.booking_no bookingNo, b.title, u.display_name displayName, s.name_th sportName, c.name courtName, b.starts_at startsAt, b.ends_at endsAt, b.players, b.amount, b.status, b.expires_at expiresAt, b.cancel_reason cancelReason, b.checked_in_at checkedInAt FROM bookings b JOIN users u ON u.id = b.user_id JOIN sports s ON s.id = b.sport_id LEFT JOIN courts c ON c.id = b.court_id ORDER BY b.starts_at DESC LIMIT 200",
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
