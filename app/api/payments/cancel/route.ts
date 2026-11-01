import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ paymentNo: z.string().regex(/^PAY[A-Z0-9]{6,60}$/) });

// A member withdraws their own unpaid request (e.g. chose PromptPay by mistake). Once a slip
// has been sent, only staff can resolve it because money may already have moved.
export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `payment-cancel:${await clientIp()}`, limit: 20, windowMs: 60_000 });
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
  const [payment] = await query<{ id: number; status: string; slipUploadedAt: string | null }>(
    "SELECT id, status, slip_uploaded_at slipUploadedAt FROM payments WHERE payment_no = ? AND user_id = ? LIMIT 1",
    [input.paymentNo, user.id],
  );
  if (!payment) return NextResponse.json({ message: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  if (payment.status !== "created") return NextResponse.json({ message: "รายการนี้ไม่ได้รอชำระแล้ว" }, { status: 409 });
  if (payment.slipUploadedAt) return NextResponse.json({ message: "ส่งสลิปแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อยกเลิก" }, { status: 409 });
  const result = (await query("UPDATE payments SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'created' AND slip_uploaded_at IS NULL", [payment.id, user.id])) as unknown as { affectedRows?: number };
  if (!result.affectedRows) return NextResponse.json({ message: "รายการนี้ไม่ได้รอชำระแล้ว" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
