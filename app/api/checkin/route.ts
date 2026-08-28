import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ bookingNo: z.string().min(4), qrSecret: z.string().min(4) });

export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `checkin:${await clientIp()}`, limit: 40, windowMs: 60_000 });
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
