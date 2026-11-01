import { NextResponse } from "next/server";
import { z } from "zod";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { pool, query } from "@/lib/db";
import { notifyMember } from "@/lib/notify";
import { rewardCost } from "@/lib/payment-presentation";
import { checkRateLimit, clientIp, parseJsonBody, validationErrorResponse } from "@/lib/security";
import { requestIdPattern } from "@/lib/wallet";

const schema = z.object({ contentId: z.number().int().positive(), requestId: z.string().regex(requestIdPattern) });
const REWARD_VALID_DAYS = 30;

// Spend coins on a reward from the catalog (app_content_items type "reward", metadata.cost).
// The member receives a one-use reward right whose QR staff scan at the counter.
export async function POST(req: Request) {
  const limited = checkRateLimit({ key: `reward-redeem:${await clientIp()}`, limit: 10, windowMs: 60_000 });
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
  const [reward] = await query<{ id: number; title: string; subtitle: string | null; metadata: string | null }>(
    "SELECT id, title, subtitle, CAST(metadata AS CHAR) metadata FROM app_content_items WHERE id = ? AND content_type = 'reward' AND active = TRUE LIMIT 1",
    [input.contentId],
  );
  // Same price rule as the app and the admin editor: a positive whole number, else not redeemable.
  const cost = reward ? rewardCost(reward.metadata) : null;
  if (!reward || cost === null) return NextResponse.json({ message: "ไม่พบรางวัลนี้" }, { status: 404 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // The wallet row lock serializes this member's redemptions, so the replay check below is race-free.
    const [walletRows] = await conn.execute("SELECT coin_balance coinBalance FROM wallet_accounts WHERE user_id = ? FOR UPDATE", [user.id]);
    const [replayRows] = await conn.execute(
      "SELECT id, title, JSON_VALUE(metadata, '$.contentId') contentId FROM user_entitlements WHERE user_id = ? AND entitlement_type = 'reward' AND JSON_VALUE(metadata, '$.requestId') = ? LIMIT 1",
      [user.id, input.requestId],
    );
    const replay = (replayRows as { id: number; title: string; contentId: string | number | null }[])[0];
    if (replay) {
      await conn.rollback();
      // The same request id may only ever answer for the reward it redeemed.
      if (Number(replay.contentId) !== input.contentId) return NextResponse.json({ code: "REQUEST_REUSED", message: "คำขอนี้ถูกใช้ไปแล้ว กรุณาลองใหม่" }, { status: 409 });
      return NextResponse.json({ entitlementId: replay.id, title: replay.title, replayed: true });
    }
    const coins = Number((walletRows as { coinBalance: number }[])[0]?.coinBalance ?? 0);
    if (coins < cost) {
      await conn.rollback();
      return NextResponse.json({ message: "Coin ไม่พอสำหรับรางวัลนี้" }, { status: 409 });
    }
    await conn.execute("UPDATE wallet_accounts SET coin_balance = coin_balance - ? WHERE user_id = ?", [cost, user.id]);
    await conn.execute(
      "INSERT INTO wallet_ledger (user_id, kind, amount, coin_delta, point_delta, ref_type, ref_id, note) VALUES (?, 'coin_redeem', 0, ?, 0, 'reward', ?, ?)",
      [user.id, -cost, reward.id, `แลกรางวัล ${reward.title}`.slice(0, 255)],
    );
    const [right] = await conn.execute(
      `INSERT INTO user_entitlements (user_id, payment_id, entitlement_type, title, remaining_uses, ends_at, status, metadata) VALUES (?, NULL, 'reward', ?, 1, DATE_ADD(NOW(), INTERVAL ${REWARD_VALID_DAYS} DAY), 'active', ?)`,
      [user.id, reward.title.slice(0, 180), JSON.stringify({ contentId: reward.id, cost, requestId: input.requestId, source: "coin_redeem" })],
    );
    await notifyMember(conn, user.id, "แลกรางวัลสำเร็จ", `${reward.title} · ${cost} Coin`);
    await conn.commit();
    return NextResponse.json({ entitlementId: Number((right as { insertId?: number }).insertId || 0), title: reward.title }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
