import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool, query } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";
import { expirePendingBookings } from "@/lib/booking-rules";
import { grantPaidEntitlement } from "@/lib/entitlements";
import { resolvePaymentItem } from "@/lib/payment-catalog";
import { findPaymentByRequest, isDuplicateEntry, requestIdPattern } from "@/lib/wallet";

const schema = z.object({
  bookingNo: z.string().min(4).max(40).optional(),
  contentId: z.number().int().positive().optional(),
  trainerId: z.number().int().positive().optional(),
  trainerPackage: z.string().max(180).optional(),
  method: z.enum(["wallet", "promptpay", "card", "line_pay", "cash"]),
  amount: z.number().positive().optional(),
  itemName: z.string().trim().max(180).optional(),
  itemType: z.string().trim().max(64).optional(),
  requestId: z.string().regex(requestIdPattern).optional(),
});

export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `payment:${await clientIp()}`, limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  let input: z.infer<typeof schema>;
  try {
    input = await parseJsonBody(req, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  await expirePendingBookings();
  const booking = input.bookingNo
    ? (
        await query<{ id: number; amount: number; status: string }>(
          "SELECT id, amount, status FROM bookings WHERE booking_no = ? AND user_id = ? LIMIT 1",
          [input.bookingNo, user.id],
        )
      )[0]
    : null;
  if (input.bookingNo && !booking) return NextResponse.json({ message: "ไม่พบรายการจอง" }, { status: 404 });
  if (booking && !["hold", "pending_payment"].includes(booking.status)) return NextResponse.json({ message: "รายการนี้ไม่สามารถชำระเงินได้" }, { status: 409 });
  const catalogItem = booking ? null : await resolvePaymentItem(input);
  if (!booking && !catalogItem) return NextResponse.json({ message: "ไม่พบแพ็กเกจที่เปิดขาย กรุณาเลือกรายการใหม่" }, { status: 400 });
  const amount = Number(booking?.amount ?? catalogItem?.amount ?? 0);
  input.itemName = catalogItem?.itemName || input.itemName;
  input.itemType = catalogItem?.itemType || "booking";
  if (!amount) return NextResponse.json({ message: "ยอดชำระไม่ถูกต้อง" }, { status: 400 });

  const paymentNo = createPublicId("PAY");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const replay = await findPaymentByRequest(conn, user.id, input.requestId);
    if (replay) {
      await conn.rollback();
      return NextResponse.json({ ...replay, replayed: true });
    }
    if (booking) {
      const [rows] = await conn.execute("SELECT status, expires_at > NOW() valid FROM bookings WHERE id = ? FOR UPDATE", [booking.id]);
      const locked = (rows as { status: string; valid: number }[])[0];
      const [pending] = await conn.execute("SELECT id FROM payments WHERE booking_id = ? AND status IN ('created','paid') LIMIT 1", [booking.id]);
      if (!locked || !locked.valid || !["hold", "pending_payment"].includes(locked.status) || (pending as unknown[]).length) {
        await conn.rollback();
        return NextResponse.json({ message: "รายการนี้ถูกชำระหรือมีรายการรอยืนยันแล้ว" }, { status: 409 });
      }
    }
    if (input.method === "wallet") {
      const [walletRows] = await conn.execute("SELECT balance FROM wallet_accounts WHERE user_id = ? FOR UPDATE", [user.id]);
      const balance = Number((walletRows as { balance: number }[])[0]?.balance ?? 0);
      if (balance < amount) {
        await conn.rollback();
        return NextResponse.json({ message: "ยอดเงินใน Wallet ไม่พอ" }, { status: 409 });
      }
    }
    const paid = input.method === "wallet";
    // Snapshot the catalog terms so staff approval later grants exactly what was sold.
    const metadata = {
      itemName: input.itemName || null,
      itemType: input.itemType || (booking ? "booking" : null),
      ...(catalogItem?.contentId ? { contentId: catalogItem.contentId } : {}),
      ...(catalogItem && Object.keys(catalogItem.grant).length ? { grant: catalogItem.grant } : {}),
    };
    const [paymentResult] = await conn.execute(
      "INSERT INTO payments (payment_no, user_id, booking_id, method, amount, status, provider_ref, request_id, metadata, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [paymentNo, user.id, booking?.id ?? null, input.method, amount, paid ? "paid" : "created", createPublicId("REF"), input.requestId || null, JSON.stringify(metadata), paid ? new Date() : null],
    );
    const paymentId = Number((paymentResult as { insertId?: number }).insertId || 0) || null;
    if (paid) {
      await conn.execute("UPDATE wallet_accounts SET balance = balance - ?, coin_balance = coin_balance + 1, point_balance = point_balance + ? WHERE user_id = ?", [
        amount,
        Math.floor(amount),
        user.id,
      ]);
      await conn.execute(
        "INSERT INTO wallet_ledger (user_id, kind, amount, coin_delta, point_delta, ref_type, ref_id, note) VALUES (?, 'payment', ?, 1, ?, 'payment', ?, ?)",
        [user.id, -amount, Math.floor(amount), paymentId, input.itemName || "PPA payment"],
      );
    }
    if (booking && paid) {
      await conn.execute("UPDATE bookings SET status = 'paid' WHERE id = ?", [booking.id]);
    }
    if (!booking && paid) {
      await grantPaidEntitlement(conn, {
        amount,
        itemName: input.itemName || "PPA package",
        itemType: input.itemType,
        paymentId,
        userId: user.id,
        grant: catalogItem?.grant,
      });
    }
    await conn.commit();
    return NextResponse.json({ paymentNo, status: paid ? "paid" : "created" }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    const winner = isDuplicateEntry(error) ? await findPaymentByRequest(conn, user.id, input.requestId) : null;
    if (winner) return NextResponse.json({ ...winner, replayed: true });
    throw error;
  } finally {
    conn.release();
  }
}
