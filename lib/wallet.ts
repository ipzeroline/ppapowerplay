import type mysql from "mysql2/promise";
import { createPublicId } from "@/lib/db";

type Connection = Pick<mysql.PoolConnection, "execute">;

export { requestIdPattern } from "@/lib/request-id";

export function isDuplicateEntry(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

// A checkout that was already processed (same member + client request id) is replayed.
export async function findPaymentByRequest(conn: Connection, userId: number, requestId: string | undefined) {
  if (!requestId) return null;
  const [rows] = await conn.execute("SELECT payment_no paymentNo, status FROM payments WHERE user_id = ? AND request_id = ? LIMIT 1", [userId, requestId]);
  return (rows as { paymentNo: string; status: string }[])[0] || null;
}

export async function createPaymentRow(conn: Connection, input: { userId: number; method: "wallet" | "promptpay"; amount: number; paid: boolean; metadata: Record<string, unknown>; requestId?: string }) {
  const paymentNo = createPublicId("PAY");
  const status = input.paid ? "paid" : "created";
  const [result] = await conn.execute(
    "INSERT INTO payments (payment_no, user_id, method, amount, status, provider_ref, request_id, metadata, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'paid', NOW(), NULL))",
    [paymentNo, input.userId, input.method, input.amount, status, createPublicId("REF"), input.requestId || null, JSON.stringify(input.metadata), status],
  );
  return { paymentId: Number((result as { insertId?: number }).insertId || 0) || null, paymentNo };
}

// Locks the wallet row; returns false (without writing) when the balance is insufficient.
export async function debitWallet(conn: Connection, input: { userId: number; amount: number; note: string; paymentId: number | null }) {
  const [rows] = await conn.execute("SELECT balance FROM wallet_accounts WHERE user_id = ? FOR UPDATE", [input.userId]);
  const balance = Number((rows as { balance: number }[])[0]?.balance ?? 0);
  if (balance < input.amount) return false;
  const points = Math.floor(input.amount);
  await conn.execute("UPDATE wallet_accounts SET balance = balance - ?, coin_balance = coin_balance + 1, point_balance = point_balance + ? WHERE user_id = ?", [input.amount, points, input.userId]);
  await conn.execute(
    "INSERT INTO wallet_ledger (user_id, kind, amount, coin_delta, point_delta, ref_type, ref_id, note) VALUES (?, 'payment', ?, 1, ?, 'payment', ?, ?)",
    [input.userId, -input.amount, points, input.paymentId, input.note.slice(0, 255)],
  );
  return true;
}
