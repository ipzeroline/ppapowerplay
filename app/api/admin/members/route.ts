import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest, getAdminIdentity, adminSessionCookieName } from "@/lib/admin-auth";
import { pool, query } from "@/lib/db";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";

const memberSelect = "SELECT u.id, u.display_name displayName, u.member_code memberCode, u.phone, u.email, u.status, u.created_at createdAt, COALESCE(w.balance, 0) balance FROM users u LEFT JOIN wallet_accounts w ON w.user_id = u.id";
const inputSchema = z.object({
  id: z.number().int().positive(), displayName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(32).regex(/^[+\d\s()-]*$/),
  email: z.union([z.literal(""), z.email().max(180)]), status: z.enum(["active", "suspended"]),
}).strict();

export async function GET(req: NextRequest) {
  const denied = await assertAdminRequest(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!/^[1-9]\d{0,14}$/.test(id)) return secureResponse(NextResponse.json({ message: "Invalid member" }, { status: 400 }));
    const [member] = await query(`${memberSelect} WHERE u.id = ?`, [Number(id)]);
    if (!member) return secureResponse(NextResponse.json({ message: "ไม่พบสมาชิก" }, { status: 404 }));
    const before = req.nextUrl.searchParams.get("before");
    if (before && !/^[1-9]\d{0,14}$/.test(before)) return secureResponse(NextResponse.json({ message: "Invalid cursor" }, { status: 400 }));
    const history = await query<{ id: number }>(
      "SELECT l.id, l.kind, l.amount, l.note, l.created_at createdAt, l.ref_type refType, s.display_name staffName, JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.before')) balanceBefore, JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.after')) balanceAfter FROM wallet_ledger l LEFT JOIN admin_audit_logs a ON l.ref_type = 'admin_credit' AND a.id = l.ref_id LEFT JOIN admin_staff s ON s.id = a.staff_id WHERE l.user_id = ?" + (before ? " AND l.id < ?" : "") + " ORDER BY l.id DESC LIMIT 31", before ? [Number(id), Number(before)] : [Number(id)],
    );
    return secureResponse(NextResponse.json({ member, history: history.slice(0, 30), nextCursor: history.length > 30 ? history[29].id : null }));
  }
  const search = (req.nextUrl.searchParams.get("search") || "").trim().slice(0, 160);
  const page = Number(req.nextUrl.searchParams.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return secureResponse(NextResponse.json({ message: "Invalid page" }, { status: 400 }));
  const rows = await query(`${memberSelect} WHERE (? = '' OR LOCATE(?, u.display_name) > 0 OR LOCATE(?, u.member_code) > 0 OR LOCATE(?, COALESCE(u.phone, '')) > 0 OR LOCATE(?, COALESCE(u.email, '')) > 0) ORDER BY u.id DESC LIMIT 51 OFFSET ${(page - 1) * 50}`, [search, search, search, search, search]);
  return secureResponse(NextResponse.json({ members: rows.slice(0, 50), hasMore: rows.length > 50 }));
}

export async function PUT(req: NextRequest) {
  const denied = await assertAdminRequest(req);
  if (denied) return denied;
  const admin = await getAdminIdentity(req.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return secureResponse(NextResponse.json({ message: "Admin access denied" }, { status: 401 }));
  let input: z.infer<typeof inputSchema>;
  try { input = await parseJsonBody(req, inputSchema); } catch (error) { return validationErrorResponse(error); }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute("SELECT display_name displayName, phone, email, status FROM users WHERE id = ? FOR UPDATE", [input.id]);
    const original = (rows as { status: string }[])[0];
    if (!original || original.status === "deleted") {
      await conn.rollback();
      return secureResponse(NextResponse.json({ message: "ไม่พบสมาชิกที่แก้ไขได้" }, { status: 404 }));
    }
    await conn.execute("UPDATE users SET display_name = ?, phone = ?, email = ?, status = ? WHERE id = ?", [input.displayName, input.phone || null, input.email || null, input.status, input.id]);
    await conn.execute("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'member.update', 'user', ?, ?)", [admin.id, String(input.id), JSON.stringify({ before: original, after: { displayName: input.displayName, phone: input.phone || null, email: input.email || null, status: input.status } })]);
    await conn.commit();
    return secureResponse(NextResponse.json({ ok: true }));
  } catch { await conn.rollback(); return secureResponse(NextResponse.json({ message: "บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลก่อนลองใหม่" }, { status: 503 })); }
  finally { conn.release(); }
}
