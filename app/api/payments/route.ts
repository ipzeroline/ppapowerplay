import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool, query } from "@/lib/db";

const schema = z.object({
  bookingNo: z.string().optional(),
  method: z.enum(["wallet", "promptpay", "card", "line_pay", "cash"]),
  amount: z.number().positive().optional(),
  itemName: z.string().optional(),
  markPaid: z.boolean().default(false),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const input = schema.parse(await req.json());
  const booking = input.bookingNo
    ? (
        await query<{ id: number; amount: number }>(
          "SELECT id, amount FROM bookings WHERE booking_no = ? AND user_id = ? LIMIT 1",
          [input.bookingNo, user.id],
        )
      )[0]
    : null;
  const amount = Number(booking?.amount ?? input.amount ?? 0);
  if (!amount) return NextResponse.json({ message: "ยอดชำระไม่ถูกต้อง" }, { status: 400 });

  const paymentNo = createPublicId("PAY");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (input.method === "wallet") {
      const [walletRows] = await conn.execute("SELECT balance FROM wallet_accounts WHERE user_id = ? FOR UPDATE", [user.id]);
      const balance = Number((walletRows as { balance: number }[])[0]?.balance ?? 0);
      if (balance < amount) {
        await conn.rollback();
        return NextResponse.json({ message: "ยอดเงินใน Wallet ไม่พอ" }, { status: 409 });
      }
      await conn.execute("UPDATE wallet_accounts SET balance = balance - ?, coin_balance = coin_balance + 1, point_balance = point_balance + ? WHERE user_id = ?", [
        amount,
        Math.floor(amount),
        user.id,
      ]);
      await conn.execute(
        "INSERT INTO wallet_ledger (user_id, kind, amount, coin_delta, point_delta, ref_type, note) VALUES (?, 'payment', ?, 1, ?, 'payment', ?)",
        [user.id, -amount, Math.floor(amount), input.itemName || "PPA payment"],
      );
    } else if (input.markPaid) {
      await conn.execute("UPDATE wallet_accounts SET coin_balance = coin_balance + 1, point_balance = point_balance + ? WHERE user_id = ?", [
        Math.floor(amount),
        user.id,
      ]);
    }
    await conn.execute(
      "INSERT INTO payments (payment_no, user_id, booking_id, method, amount, status, provider_ref, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [paymentNo, user.id, booking?.id ?? null, input.method, amount, input.markPaid || input.method === "wallet" ? "paid" : "created", createPublicId("REF"), input.markPaid || input.method === "wallet" ? new Date() : null],
    );
    if (booking && (input.markPaid || input.method === "wallet")) {
      await conn.execute("UPDATE bookings SET status = 'paid' WHERE id = ?", [booking.id]);
    }
    await conn.commit();
    return NextResponse.json({ paymentNo, status: input.markPaid || input.method === "wallet" ? "paid" : "created" }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
