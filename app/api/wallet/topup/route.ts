import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";
import { findPaymentByRequest, isDuplicateEntry, requestIdPattern } from "@/lib/wallet";

const schema = z.object({ amount: z.number().int().min(50).max(50000), requestId: z.string().regex(requestIdPattern).optional() });

export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `wallet-topup:${await clientIp()}`, limit: 20, windowMs: 60_000 });
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
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const replay = await findPaymentByRequest(conn, user.id, input.requestId);
    if (replay) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ ok: true, ...replay, replayed: true }));
    }
    await conn.execute("INSERT IGNORE INTO wallet_accounts (user_id) VALUES (?)", [user.id]);
    const paymentNo = createPublicId("PAY");
    await conn.execute(
      "INSERT INTO payments (payment_no, user_id, method, amount, status, provider_ref, request_id, metadata) VALUES (?, ?, 'promptpay', ?, 'created', ?, ?, JSON_OBJECT('kind', 'wallet_topup', 'itemName', 'เติมเงิน Wallet'))",
      [paymentNo, user.id, input.amount, createPublicId("REF"), input.requestId || null],
    );
    await conn.commit();
    return secureResponse(NextResponse.json({ ok: true, status: "created", paymentNo }));
  } catch (error) {
    await conn.rollback();
    const winner = isDuplicateEntry(error) ? await findPaymentByRequest(conn, user.id, input.requestId) : null;
    if (winner) return secureResponse(NextResponse.json({ ok: true, ...winner, replayed: true }));
    throw error;
  } finally {
    conn.release();
  }
}
