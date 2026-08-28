import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

const profileSchema = z.object({
  staffId: z.number().positive(),
  username: z.string().min(3).max(80),
  displayName: z.string().min(2).max(160),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(32).optional().or(z.literal("")),
});

export async function PUT(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof profileSchema>;
  try {
    body = await parseJsonBody(request, profileSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  const duplicate = await query<{ id: number }>("SELECT id FROM admin_staff WHERE username = ? AND id <> ? AND status <> 'deleted' LIMIT 1", [
    body.username,
    body.staffId,
  ]);
  if (duplicate[0]) return NextResponse.json({ message: "Username is already used" }, { status: 409 });

  await query("UPDATE admin_staff SET username = ?, display_name = ?, email = ?, phone = ? WHERE id = ? AND status = 'active'", [
    body.username,
    body.displayName,
    body.email || null,
    body.phone || null,
    body.staffId,
  ]);
  await query("INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'profile.update', 'admin_staff', ?, JSON_OBJECT('username', ?))", [
    body.staffId,
    String(body.staffId),
    body.username,
  ]);

  const rows = await query(
    "SELECT s.id, s.username, s.display_name displayName, s.email, s.phone, s.status, s.role_id roleId, r.code roleCode, r.name_th roleNameTh, r.name_en roleNameEn, s.created_at createdAt FROM admin_staff s JOIN admin_roles r ON r.id = s.role_id WHERE s.status <> 'deleted' ORDER BY s.id DESC",
  );
  const admin = (rows as { id: number }[]).find((row) => row.id === body.staffId) || null;
  return NextResponse.json({ admin, staff: rows });
}
