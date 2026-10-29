import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest, getAdminIdentity, adminSessionCookieName } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  memberId: z.number().int().positive(), direction: z.enum(["add", "deduct"]),
  amount: z.string().regex(/^\d{1,5}(\.\d{1,2})?$/).refine((value) => Number(value) > 0 && Number(value) <= 50000),
  reason: z.string().trim().min(3).max(255), requestId: z.uuid(),
}).strict();

export async function POST(req: NextRequest) {
  const denied = await assertAdminRequest(req);
  if (denied) return denied;
  const admin = await getAdminIdentity(req.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return secureResponse(NextResponse.json({ message: "Admin access denied" }, { status: 401 }));
  let input: z.infer<typeof schema>;
  try { input = await parseJsonBody(req, schema); } catch (error) { return validationErrorResponse(error); }
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [users] = await conn.execute("SELECT id, status FROM users WHERE id = ? FOR UPDATE", [input.memberId]);
    const member = (users as { status: string }[])[0];
    if (!member || member.status === "deleted") {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "ไม่พบสมาชิกที่ปรับเครดิตได้" }, { status: 404 }));
    }
    // The member lock serializes retries even when a wallet has not been created yet.
    const [previous] = await conn.execute("SELECT staff_id staffId, CAST(metadata AS CHAR) metadata FROM admin_audit_logs WHERE action = 'member.credit' AND target_type = 'user' AND target_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.requestId')) = ? LIMIT 1", [String(input.memberId), input.requestId]);
    const prior = (previous as { staffId: number; metadata: string }[])[0];
    const deltaCents = Math.round(Number(input.amount) * 100) * (input.direction === "add" ? 1 : -1);
    if (prior) {
      const data = JSON.parse(prior.metadata);
      if (Number(prior.staffId) !== admin.id || data.deltaCents !== deltaCents || data.reason !== input.reason) {
        await conn.rollback();
        return secureResponse(NextResponse.json({ message: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 }));
      }
      await conn.commit();
      return secureResponse(NextResponse.json({ ok: true, duplicate: true, balance: data.after }));
    }
    await conn.execute("INSERT IGNORE INTO wallet_accounts (user_id) VALUES (?)", [input.memberId]);
    const [wallets] = await conn.execute("SELECT balance FROM wallet_accounts WHERE user_id = ? FOR UPDATE", [input.memberId]);
    const beforeCents = Math.round(Number((wallets as { balance: string | number }[])[0].balance) * 100);
    const afterCents = beforeCents + deltaCents;
    if (afterCents < 0 || afterCents > 999999999999) {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: afterCents < 0 ? "เครดิตไม่เพียงพอสำหรับการหัก" : "ยอดเครดิตเกินขีดจำกัด" }, { status: 409 }));
    }
    const before = (beforeCents / 100).toFixed(2);
    const after = (afterCents / 100).toFixed(2);
    const [audit] = await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'member.credit', 'user', ?, ?)", [admin.id, String(input.memberId), JSON.stringify({ requestId: input.requestId, before, after, deltaCents, reason: input.reason })]);
    await conn.execute("UPDATE wallet_accounts SET balance = ? WHERE user_id = ?", [after, input.memberId]);
    await conn.execute("INSERT INTO wallet_ledger (user_id, kind, amount, ref_type, ref_id, note) VALUES (?, ?, ?, 'admin_credit', ?, ?)", [input.memberId, deltaCents > 0 ? "topup" : "payment", (deltaCents / 100).toFixed(2), (audit as { insertId: number }).insertId, input.reason]);
    await conn.commit();
    return secureResponse(NextResponse.json({ ok: true, balance: after }));
  } catch {
    await conn?.rollback().catch(() => {});
    return secureResponse(NextResponse.json({ message: "ไม่ทราบผลการปรับเครดิต กรุณาลองรายการเดิมอีกครั้งเพื่อตรวจสอบ" }, { status: 503 }));
  } finally { conn?.release(); }
}
