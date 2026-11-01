import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { pool } from "@/lib/db";
import { applyCouponRenewal, assertNoPendingRequest, checkCouponRenewal, RenewalError, renewalOption } from "@/lib/renewals";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";
import { createPaymentRow, debitWallet, findPaymentByRequest, isDuplicateEntry, requestIdPattern } from "@/lib/wallet";

const schema = z.object({ userCouponId: z.number().int().positive(), method: z.enum(["wallet", "promptpay"]), requestId: z.string().regex(requestIdPattern).optional() });

// Paid coupon renewal: extends expiry by the configured months; remaining uses unchanged.
export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `coupon-renew:${await clientIp()}`, limit: 10, windowMs: 60_000 });
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
  const option = await renewalOption("coupon_renewal");
  if (!option) return NextResponse.json({ message: "ยังไม่เปิดให้ต่ออายุคูปอง" }, { status: 404 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const replay = await findPaymentByRequest(conn, user.id, input.requestId);
    if (replay) {
      await conn.rollback();
      return NextResponse.json({ ...replay, replayed: true });
    }
    const coupon = await checkCouponRenewal(conn, { userId: user.id, userCouponId: input.userCouponId });
    await assertNoPendingRequest(conn, { userId: user.id, itemType: "coupon_renewal", refKey: "userCouponId", refId: input.userCouponId });
    const paid = input.method === "wallet";
    const amount = option.price * option.months;
    const itemName = `${option.title} · ${coupon.name}`;
    const metadata = { itemType: "coupon_renewal", itemName, contentId: option.contentId, userCouponId: input.userCouponId, months: option.months };
    const { paymentId, paymentNo } = await createPaymentRow(conn, { userId: user.id, method: input.method, amount, paid, metadata, requestId: input.requestId });
    if (paid) {
      if (!(await debitWallet(conn, { userId: user.id, amount, note: itemName, paymentId }))) {
        await conn.rollback();
        return NextResponse.json({ message: "ยอดเงินใน Wallet ไม่พอ" }, { status: 409 });
      }
      await applyCouponRenewal(conn, { userId: user.id, userCouponId: input.userCouponId, months: option.months });
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
