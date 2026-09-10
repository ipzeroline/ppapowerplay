import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest, adminSessionCookieName, getAdminIdentity, createAdminSessionCookie, adminSessionCookieOptions } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

const schema = z.object({
  staffId: z.number().positive(),
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});

export async function PUT(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const identity = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");

  let body: z.infer<typeof schema>;
  try {
    body = await parseJsonBody(request, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  if (!identity || body.staffId !== identity.id) return NextResponse.json({ message: "Permission denied" }, { status: 403 });
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName(), createAdminSessionCookie(identity.id, nextHash), adminSessionCookieOptions());
  return response;
}
