import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookieName, assertAdminRequest, getAdminIdentity } from "@/lib/admin-auth";
import { counterPaymentSchema } from "@/lib/counter-booking";
import { createPublicId, pool } from "@/lib/db";
import { notifyMember, pushAfterResponse, pushText } from "@/lib/notify";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";

type BookingRow = { id: number; bookingNo: string; userId: number; status: string; amount: number; title: string; guestName: string | null; guestPhone: string | null; held: number };
const json = (body: unknown, status = 200) => secureResponse(NextResponse.json(body, { status }));

// Take the payment of a held counter booking at the counter (cash, card or transfer checked by staff).
export async function POST(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const admin = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return json({ message: "Admin access denied" }, 401);
  let input: { bookingNo: string; method: "cash" | "card" | "promptpay"; requestId: string };
  try {
    input = await parseJsonBody(request, counterPaymentSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  const conn = await pool.getConnection();
  const stop = async (body: Record<string, unknown>, status: number) => {
    await conn.rollback();
    return json(body, status);
  };
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT b.id, b.booking_no bookingNo, b.user_id userId, b.status, b.amount, b.title, b.guest_name guestName, b.guest_phone guestPhone, (b.expires_at IS NULL OR b.expires_at > NOW()) held FROM bookings b WHERE b.booking_no = ? FOR UPDATE",
      [input.bookingNo],
    );
    const booking = (rows as BookingRow[])[0];
    if (!booking) return await stop({ message: "ไม่พบรายการจอง" }, 404);
    const [replay] = await conn.execute("SELECT payment_no paymentNo FROM payments WHERE user_id = ? AND request_id = ? LIMIT 1", [booking.userId, input.requestId]);
    const previous = (replay as { paymentNo: string }[])[0];
    if (previous) return await stop({ paymentNo: previous.paymentNo, replayed: true }, 200);
    if (!["hold", "pending_payment"].includes(booking.status) || !Number(booking.held)) return await stop({ message: "รายการจองนี้ไม่ได้รอชำระแล้ว" }, 409);
    // A member's own PromptPay request for this booking is confirmed in the payment queue instead,
    // so the same booking is never paid twice.
    const [open] = await conn.execute("SELECT id FROM payments WHERE booking_id = ? AND status = 'created' LIMIT 1 FOR UPDATE", [booking.id]);
    if ((open as unknown[]).length) return await stop({ message: "มีรายการรอชำระของการจองนี้ กรุณายืนยันผ่านรายการชำระเงิน" }, 409);

    const paymentNo = createPublicId("PAY");
    const amount = Number(booking.amount);
    const guest = booking.guestName ? { guestName: booking.guestName, guestPhone: booking.guestPhone } : {};
    await conn.execute(
      "INSERT INTO payments (payment_no, user_id, booking_id, method, amount, status, provider_ref, request_id, metadata, paid_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, NOW())",
      [paymentNo, booking.userId, booking.id, input.method, amount, createPublicId("REF"), input.requestId, JSON.stringify({ itemName: booking.title, itemType: "booking", channel: "counter", soldBy: admin.id, ...guest })],
    );
    await conn.execute("UPDATE bookings SET status = 'paid' WHERE id = ?", [booking.id]);
    const body = `${booking.title} · ${amount.toLocaleString("th-TH")} ฿ · ${paymentNo}`;
    if (!booking.guestName) await notifyMember(conn, booking.userId, "ชำระเงินสำเร็จ", body);
    await conn.execute(
      "INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'booking.pay', 'booking', ?, ?)",
      [admin.id, booking.bookingNo, JSON.stringify({ paymentNo, method: input.method, amount })],
    );
    await conn.commit();
    if (!booking.guestName) pushAfterResponse(booking.userId, pushText("ชำระเงินสำเร็จ", body));
    return json({ paymentNo });
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}
