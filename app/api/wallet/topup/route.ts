import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ amount: z.number().int().min(50).max(50000) });

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
    await conn.execute("INSERT IGNORE INTO wallet_accounts (user_id) VALUES (?)", [user.id]);
    await conn.execute(
      "INSERT INTO payments (payment_no, user_id, method, amount, status, provider_ref, metadata) VALUES (?, ?, 'promptpay', ?, 'created', ?, JSON_OBJECT('kind', 'wallet_topup'))",
      [createPublicId("PAY"), user.id, input.amount, createPublicId("REF")],
    );
    await conn.commit();
    return NextResponse.json({ ok: true, status: "created" });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
