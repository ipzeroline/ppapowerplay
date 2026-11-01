import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { pool } from "@/lib/db";
import { assertSameOrigin, checkRateLimit, clientIp, readRequestBody, secureResponse, validationErrorResponse } from "@/lib/security";
import { detectImageType, removeSlip, saveSlip, SLIP_MAX_BYTES } from "@/lib/slips";
import { isDuplicateEntry } from "@/lib/wallet";

const json = (body: unknown, status = 200) => secureResponse(NextResponse.json(body, { status }));
type Connection = Awaited<ReturnType<typeof pool.getConnection>>;
type PaymentRow = { id: number; status: string; method: string; slipPath: string | null; bookingId: number | null; metadataText: string | null };
type BookingRow = { id: number; courtId: number | null; status: string; holdValid: number; notEnded: number; startsAt: string; endsAt: string };

function parseMetadata(text: string | null): Record<string, unknown> {
  try {
    const value: unknown = text ? JSON.parse(text) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const bookingExpired = () => json({ code: "BOOKING_EXPIRED", message: "หมดเวลาการจองนี้แล้ว หากโอนเงินแล้วกรุณาติดต่อเจ้าหน้าที่พร้อมสลิป" }, 409);

// A court booking is held for 15 minutes. A slip sent in time (or late, while the slot is still free)
// keeps the court reserved until staff confirm or cancel, at most until the session ends.
async function holdBookingForSlip(conn: Connection, bookingId: number, userId: number) {
  const [rows] = await conn.execute(
    "SELECT id, court_id courtId, status, starts_at startsAt, ends_at endsAt, expires_at > NOW() holdValid, ends_at > NOW() notEnded FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE",
    [bookingId, userId],
  );
  const booking = (rows as BookingRow[])[0];
  if (!booking) return false;
  const held = ["hold", "pending_payment"].includes(booking.status) && Number(booking.holdValid) > 0;
  if (!held) {
    if (!["hold", "pending_payment", "expired"].includes(booking.status) || !Number(booking.notEnded)) return false;
    if (booking.courtId) {
      const [taken] = await conn.execute(
        "SELECT id FROM bookings WHERE court_id = ? AND id <> ? AND (status IN ('paid','checked_in') OR (status IN ('hold','pending_payment') AND (expires_at IS NULL OR expires_at > NOW()))) AND starts_at < ? AND ends_at > ? LIMIT 1 FOR UPDATE",
        [booking.courtId, booking.id, booking.endsAt, booking.startsAt],
      );
      if ((taken as unknown[]).length) return false;
    }
  }
  await conn.execute("UPDATE bookings SET expires_at = ends_at, status = IF(status = 'expired', 'pending_payment', status) WHERE id = ?", [booking.id]);
  return true;
}

// Member attaches the transfer slip to their own unpaid payment; staff review it before confirming.
export async function POST(req: Request) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const limited = checkRateLimit({ key: `payment-slip:${await clientIp()}`, limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  let form: FormData;
  try {
    const body = await readRequestBody(req, SLIP_MAX_BYTES + 64 * 1024);
    form = await new Response(new Uint8Array(body), { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData();
  } catch (error) {
    if (error instanceof TypeError) return json({ message: "ไฟล์ไม่ถูกต้อง" }, 400);
    return validationErrorResponse(error);
  }
  const paymentNo = String(form.get("paymentNo") || "");
  const file = form.get("file");
  if (!/^PAY[A-Z0-9]{6,60}$/.test(paymentNo) || !(file instanceof File)) return json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, 400);
  if (file.size > SLIP_MAX_BYTES) return json({ message: "ไฟล์สลิปต้องไม่เกิน 5 MB" }, 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return json({ message: "รองรับเฉพาะรูปภาพ JPG, PNG หรือ WEBP" }, 415);

  const conn = await pool.getConnection();
  let name: string | null = null;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT id, status, method, slip_path slipPath, booking_id bookingId, CAST(metadata AS CHAR) metadataText FROM payments WHERE payment_no = ? AND user_id = ? FOR UPDATE",
      [paymentNo, user.id],
    );
    const payment = (rows as PaymentRow[])[0];
    if (!payment) {
      await conn.rollback();
      return json({ message: "ไม่พบรายการชำระเงิน" }, 404);
    }
    if (payment.status !== "created") {
      await conn.rollback();
      return json({ message: "รายการนี้ไม่ได้รอชำระแล้ว" }, 409);
    }
    if (payment.method !== "promptpay") {
      await conn.rollback();
      return json({ code: "NOT_PROMPTPAY", message: "รายการนี้ไม่ได้ชำระด้วยพร้อมเพย์" }, 409);
    }
    if (payment.bookingId && !(await holdBookingForSlip(conn, payment.bookingId, user.id))) {
      await conn.rollback();
      return bookingExpired();
    }
    name = await saveSlip(paymentNo, bytes, type);
    if (payment.slipPath) {
      // A replaced slip stays on disk and is listed for staff: slips are evidence of a transfer.
      const metadata = parseMetadata(payment.metadataText);
      const previousSlips = Array.isArray(metadata.previousSlips) ? metadata.previousSlips.filter((value): value is string => typeof value === "string") : [];
      metadata.previousSlips = [...previousSlips, payment.slipPath].slice(-10);
      await conn.execute("UPDATE payments SET slip_path = ?, slip_uploaded_at = NOW(), metadata = ? WHERE id = ?", [name, JSON.stringify(metadata), payment.id]);
    } else {
      await conn.execute("UPDATE payments SET slip_path = ?, slip_uploaded_at = NOW() WHERE id = ?", [name, payment.id]);
    }
    await conn.commit();
    return json({ ok: true, bookingHeld: Boolean(payment.bookingId) });
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (name) await removeSlip(name);
    // The bookings slot key can collide when re-reserving a lapsed hold: the slot is no longer free.
    if (isDuplicateEntry(error)) return bookingExpired();
    throw error;
  } finally {
    conn.release();
  }
}
