import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";

const schema = z.object({ bookingNo: z.string().min(4), qrSecret: z.string().min(4) });

export async function POST(req: Request) {
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const input = schema.parse(await req.json());
  const booking = (
    await query<{ id: number }>(
      "SELECT id FROM bookings WHERE booking_no = ? AND qr_secret = ? AND user_id = ? AND status = 'paid' LIMIT 1",
      [input.bookingNo, input.qrSecret, user.id],
    )
  )[0];
  if (!booking) return NextResponse.json({ message: "QR ไม่ถูกต้องหรือยังไม่ได้ชำระเงิน" }, { status: 404 });
  await query("UPDATE bookings SET status = 'checked_in' WHERE id = ?", [booking.id]);
  return NextResponse.json({ ok: true });
}
