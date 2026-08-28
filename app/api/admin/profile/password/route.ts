import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  staffId: z.number().positive(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});

export async function PUT(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof schema>;
  try {
    body = await parseJsonBody(request, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  const rows = await query<{ id: number; passwordHash: string; username: string }>(
    "SELECT id, password_hash passwordHash, username FROM admin_staff WHERE id = ? AND status = 'active'",
    [body.staffId],
  );

  const admin = rows[0];
  if (!admin) return NextResponse.json({ message: "Admin user not found" }, { status: 404 });

  const currentPasswordValid = await verifyPassword(body.currentPassword, admin.passwordHash);
  if (!currentPasswordValid) return NextResponse.json({ message: "Current password is incorrect" }, { status: 400 });

  const nextHash = await hashPassword(body.newPassword);
  await query("UPDATE admin_staff SET password_hash = ? WHERE id = ?", [nextHash, body.staffId]);
  await query("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'profile.password.update', 'admin_staff', ?, JSON_OBJECT('username', ?))", [
    body.staffId,
    String(body.staffId),
    admin.username,
  ]);

  return NextResponse.json({ ok: true });
}
