import { NextResponse, type NextRequest } from "next/server";
import { getAdminIdentity, adminSessionCookieName } from "@/lib/admin-auth";
import { query } from "@/lib/db";

export async function assertRoleAssignment(request: NextRequest, roleId: number, staffId?: number) {
  const actor = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  const denied = () => NextResponse.json({ message: "Cannot manage this account or role" }, { status: 403 });
  if (!actor) return denied();
  const [role] = await query<{ level: number; code: string }>("SELECT level, code FROM admin_roles WHERE id = ?", [roleId]);
  if (!role) return NextResponse.json({ message: "Role not found" }, { status: 400 });
  if (actor.roleCode === "super_admin") {
    if (staffId) {
      const [target] = await query<{ code: string }>("SELECT r.code FROM admin_staff s JOIN admin_roles r ON r.id = s.role_id WHERE s.id = ?", [staffId]);
      if (target?.code === "super_admin") return denied();
    }
    // The profile endpoint handles self edits; staff management cannot remove its own administrator.
    return staffId === actor.id ? denied() : null;
  }
  const [actorRole] = await query<{ level: number }>("SELECT level FROM admin_roles WHERE id = ?", [actor.roleId]);
  if (!actorRole || role.code === "super_admin" || role.level >= actorRole.level || staffId === actor.id) return denied();
  if (staffId) {
    const [target] = await query<{ level: number; code: string }>("SELECT r.level, r.code FROM admin_staff s JOIN admin_roles r ON r.id = s.role_id WHERE s.id = ?", [staffId]);
    if (!target || target.code === "super_admin" || target.level >= actorRole.level) return denied();
  }
  const permissions = await query<{ code: string }>("SELECT p.code FROM admin_permissions p JOIN admin_role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?", [roleId]);
  return permissions.some((p) => !actor.permissionCodes.includes(p.code)) ? denied() : null;
}
