import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";

type RoleRow = {
  id: number;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string | null;
  level: number;
  isSystem: number | boolean;
  permissionCodes: string;
};

const roleSchema = z.object({
  id: z.number().optional(),
  code: z.string().min(3).max(64).regex(/^[a-z0-9_]+$/),
  nameTh: z.string().min(2).max(120),
  nameEn: z.string().min(2).max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  level: z.number().min(1).max(100),
  permissionCodes: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const [roles, permissions] = await Promise.all([loadRoles(), query("SELECT id, code, name_th nameTh, name_en nameEn, group_key groupKey FROM admin_permissions ORDER BY group_key, code")]);
  return NextResponse.json({ roles, permissions });
}

export async function POST(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const body = roleSchema.parse(await request.json());
  await query(
    "INSERT INTO admin_roles (code, name_th, name_en, description, level, is_system) VALUES (?, ?, ?, ?, ?, FALSE)",
    [body.code, body.nameTh, body.nameEn, body.description || null, body.level],
  );
  const rows = await query<{ id: number }>("SELECT id FROM admin_roles WHERE code = ?", [body.code]);
  await replacePermissions(rows[0].id, body.permissionCodes);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('role.create', 'admin_roles', ?, JSON_OBJECT('code', ?))", [
    String(rows[0].id),
    body.code,
  ]);
  return GET(request);
}

export async function PUT(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const body = roleSchema.extend({ id: z.number().positive() }).parse(await request.json());
  await query("UPDATE admin_roles SET code = ?, name_th = ?, name_en = ?, description = ?, level = ? WHERE id = ?", [
    body.code,
    body.nameTh,
    body.nameEn,
    body.description || null,
    body.level,
    body.id,
  ]);
  await replacePermissions(body.id, body.permissionCodes);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('role.update', 'admin_roles', ?, JSON_OBJECT('code', ?))", [
    String(body.id),
    body.code,
  ]);
  return GET(request);
}

export async function DELETE(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ message: "Missing role id" }, { status: 400 });

  const staffRows = await query<{ total: number }>("SELECT COUNT(*) total FROM admin_staff WHERE role_id = ? AND status <> 'deleted'", [id]);
  if (staffRows[0]?.total) return NextResponse.json({ message: "Role is assigned to active staff" }, { status: 409 });

  const fallbackRows = await query<{ id: number }>("SELECT id FROM admin_roles WHERE code = 'super_admin' LIMIT 1");
  if (fallbackRows[0]?.id) {
    await query("UPDATE admin_staff SET role_id = ? WHERE role_id = ? AND status = 'deleted'", [fallbackRows[0].id, id]);
  }
  await query("DELETE FROM admin_roles WHERE id = ? AND is_system = FALSE", [id]);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id) VALUES ('role.delete', 'admin_roles', ?)", [String(id)]);
  return GET(request);
}

async function loadRoles() {
  const rows = await query<RoleRow>(
    "SELECT r.id, r.code, r.name_th nameTh, r.name_en nameEn, r.description, r.level, r.is_system isSystem, COALESCE(GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ','), '') permissionCodes FROM admin_roles r LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id LEFT JOIN admin_permissions p ON p.id = rp.permission_id GROUP BY r.id, r.code, r.name_th, r.name_en, r.description, r.level, r.is_system ORDER BY r.level DESC, r.id",
  );
  return rows.map((role) => ({
    ...role,
    isSystem: Boolean(role.isSystem),
    permissionCodes: role.permissionCodes ? role.permissionCodes.split(",") : [],
  }));
}

async function replacePermissions(roleId: number, permissionCodes: string[]) {
  await query("DELETE FROM admin_role_permissions WHERE role_id = ?", [roleId]);
  if (!permissionCodes.length) return;
  const placeholders = permissionCodes.map(() => "?").join(",");
  await query(
    `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id) SELECT ?, id FROM admin_permissions WHERE code IN (${placeholders})`,
    [roleId, ...permissionCodes],
  );
}
