import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { pool } from "@/lib/db";
import { bangkokToday } from "@/lib/court-availability";
import { applyMembershipPause, assertNoPendingRequest, checkPauseRequest, PAUSE_MAX_DAYS, RenewalError, renewalOption } from "@/lib/renewals";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";
import { createPaymentRow, debitWallet, findPaymentByRequest, isDuplicateEntry, requestIdPattern } from "@/lib/wallet";

const schema = z.object({
  membershipId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(PAUSE_MAX_DAYS),
  method: z.enum(["wallet", "promptpay"]),
  requestId: z.string().regex(requestIdPattern).optional(),
});

// Paid package pause. Wallet payments apply immediately; PromptPay requests are applied
// when staff confirm the payment (app/api/admin/payments).
export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `membership-pause:${await clientIp()}`, limit: 10, windowMs: 60_000 });
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
  const option = await renewalOption("membership_pause");
  if (!option) return NextResponse.json({ message: "ยังไม่เปิดให้ขอพักการใช้งานแพ็กเกจ" }, { status: 404 });

  const today = bangkokToday();
  const request = { userId: user.id, membershipId: input.membershipId, startDate: input.startDate, days: input.days, today, maxDays: option.maxDays };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const replay = await findPaymentByRequest(conn, user.id, input.requestId);
    if (replay) {
      await conn.rollback();
      return NextResponse.json({ ...replay, replayed: true });
    }
    await checkPauseRequest(conn, request);
    await assertNoPendingRequest(conn, { userId: user.id, itemType: "membership_pause", refKey: "membershipId", refId: input.membershipId });
    const paid = input.method === "wallet";
    const itemName = `${option.title} ${input.days} วัน`;
    const metadata = { itemType: "membership_pause", itemName, contentId: option.contentId, membershipId: input.membershipId, startDate: input.startDate, days: input.days };
    const { paymentId, paymentNo } = await createPaymentRow(conn, { userId: user.id, method: input.method, amount: option.price, paid, metadata, requestId: input.requestId });
    if (paid) {
      if (!(await debitWallet(conn, { userId: user.id, amount: option.price, note: itemName, paymentId }))) {
        await conn.rollback();
        return NextResponse.json({ message: "ยอดเงินใน Wallet ไม่พอ" }, { status: 409 });
      }
      await applyMembershipPause(conn, { ...request, paymentId });
    }
    await conn.commit();
    return NextResponse.json({ paymentNo, status: paid ? "paid" : "created" }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    if (error instanceof RenewalError) return NextResponse.json({ message: error.message }, { status: error.status });
    // A concurrent duplicate of the same checkout lost the unique-key race: replay the winner.
    const winner = isDuplicateEntry(error) ? await findPaymentByRequest(conn, user.id, input.requestId) : null;
    if (winner) return NextResponse.json({ ...winner, replayed: true });
    throw error;
  } finally {
    conn.release();
  }
}
