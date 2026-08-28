import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { pool } from "@/lib/db";

const schema = z.object({ amount: z.number().int().min(50).max(50000) });

export async function POST(req: Request) {
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const input = schema.parse(await req.json());
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("INSERT IGNORE INTO wallet_accounts (user_id) VALUES (?)", [user.id]);
    await conn.execute("UPDATE wallet_accounts SET balance = balance + ?, coin_balance = coin_balance + 2, point_balance = point_balance + ? WHERE user_id = ?", [
      input.amount,
      Math.floor(input.amount),
      user.id,
    ]);
    await conn.execute(
      "INSERT INTO wallet_ledger (user_id, kind, amount, coin_delta, point_delta, note) VALUES (?, 'topup', ?, 2, ?, 'เติมเงิน PPA Wallet')",
      [user.id, input.amount, Math.floor(input.amount)],
    );
    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
