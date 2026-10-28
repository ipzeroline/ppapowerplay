import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { createPublicId, pool } from "@/lib/db";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({ couponId: z.number().int().positive(), method: z.enum(["wallet", "promptpay"]).default("wallet") });

export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `coupon-buy:${await clientIp()}`, limit: 20, windowMs: 60_000 });
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
    const [couponRows] = await conn.execute(
      "SELECT id, price, total_uses totalUses, validity_days validityDays, name FROM coupons WHERE id = ? AND active = TRUE LIMIT 1 FOR UPDATE",
      [input.couponId],
    );
    const coupon = (couponRows as { id: number; price: number; totalUses: number; validityDays: number; name: string }[])[0];
    if (!coupon) {
      await conn.rollback();
      return NextResponse.json({ message: "ไม่พบคูปอง" }, { status: 404 });
    }
    const paymentNo = createPublicId("PAY");
    const paid = input.method === "wallet";
    const [payment] = await conn.execute(
      "INSERT INTO payments (payment_no, user_id, method, amount, status, provider_ref, metadata, paid_at) VALUES (?, ?, ?, ?, ?, ?, JSON_OBJECT('itemName', ?, 'itemType', 'coupon', 'couponId', ?), IF(? = 'paid', NOW(), NULL))",
      [paymentNo, user.id, input.method, coupon.price, paid ? "paid" : "created", createPublicId("REF"), coupon.name, coupon.id, paid ? "paid" : "created"],
    );
    const paymentId = (payment as { insertId: number }).insertId;
    if (input.method === "wallet") {
      const [walletRows] = await conn.execute("SELECT balance FROM wallet_accounts WHERE user_id = ? FOR UPDATE", [user.id]);
      const balance = Number((walletRows as { balance: number }[])[0]?.balance ?? 0);
      if (balance < Number(coupon.price)) {
        await conn.rollback();
        return NextResponse.json({ message: "ยอดเงินใน Wallet ไม่พอ" }, { status: 409 });
      }
      await conn.execute("UPDATE wallet_accounts SET balance = balance - ?, coin_balance = coin_balance + 1, point_balance = point_balance + ? WHERE user_id = ?", [
        coupon.price,
        Math.floor(Number(coupon.price)),
        user.id,
      ]);
      await conn.execute(
        "INSERT INTO wallet_ledger (user_id, kind, amount, coin_delta, point_delta, ref_type, ref_id, note) VALUES (?, 'payment', ?, 1, ?, 'payment', ?, ?)",
        [user.id, -Number(coupon.price), Math.floor(Number(coupon.price)), paymentId, `ซื้อคูปอง ${coupon.name}`],
      );
      await conn.execute(
        "INSERT INTO user_coupons (user_id, coupon_id, remaining_uses, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
        [user.id, coupon.id, coupon.totalUses, coupon.validityDays],
      );
    }
    await conn.commit();
    return NextResponse.json({ ok: true, paymentNo, status: input.method === "wallet" ? "paid" : "created" });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
