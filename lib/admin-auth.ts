import "server-only";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { checkRateLimit, secureResponse, assertSameOrigin } from "@/lib/security";
import { readSession, signSession } from "@/lib/session";

const sessionCookieName = "ppa_admin_session";
export type AdminIdentity = {
  id: number; username: string; displayName: string; email: string | null; phone: string | null;
  status: "active" | "suspended" | "deleted"; roleId: number; roleCode: string; roleNameTh: string; roleNameEn: string;
  createdAt: string; permissionCodes: string[];
};

export function createAdminSessionCookie(staffId: number, passwordHash: string) {
  return signSession("admin", `${staffId}:${fingerprint(passwordHash)}`, 8 * 60 * 60);
}

export async function getAdminIdentity(value: string): Promise<AdminIdentity | null> {
  const subject = readSession("admin", value);
  if (!subject) return null;
  const [id, version] = subject.split(":");
  if (!/^[1-9]\d*$/.test(id)) return null;
  const rows = await query<Omit<AdminIdentity, "permissionCodes"> & { passwordHash: string }>(
    "SELECT s.id, s.username, s.display_name displayName, s.email, s.phone, s.status, s.role_id roleId, s.password_hash passwordHash, s.created_at createdAt, r.code roleCode, r.name_th roleNameTh, r.name_en roleNameEn FROM admin_staff s JOIN admin_roles r ON r.id = s.role_id WHERE s.id = ? AND s.status = 'active' LIMIT 1", [id],
  );
  const row = rows[0];
  if (!row || fingerprint(row.passwordHash) !== version) return null;
  const permissions = await query<{ code: string }>("SELECT p.code FROM admin_permissions p JOIN admin_role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?", [row.roleId]);
  const { passwordHash, ...identity } = row;
  void passwordHash;
  return { ...identity, permissionCodes: permissions.map((item) => item.code) };
}

export function hasAdminPermission(admin: AdminIdentity, permission: string) {
  return admin.roleCode === "super_admin" || admin.permissionCodes.includes(permission);
}

const routePermissions: Record<string, string[]> = {
  bookings: ["bookings.manage"], courts: ["bookings.manage"], content: ["content.manage"],
  coupons: ["coupons.manage"], trainers: ["trainers.manage"], uploads: ["trainers.manage", "content.manage"],
  payments: ["payments.manage"], staff: ["staff.manage"], roles: ["roles.manage"],
  qr: ["bookings.manage", "coupons.manage", "payments.manage"], profile: [],
};

export async function assertAdminRequest(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = checkRateLimit({ key: `admin:${ip}`, limit: 90, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await getAdminIdentity(request.cookies.get(sessionCookieName)?.value || "");
  if (!admin) return secureResponse(NextResponse.json({ message: "Admin access denied" }, { status: 401 }));
  const resource = request.nextUrl.pathname.split("/")[3];
  const required = routePermissions[resource];
  if (!required || (required.length && !required.some((code) => hasAdminPermission(admin, code)))) {
    return secureResponse(NextResponse.json({ message: "Permission denied" }, { status: 403 }));
  }
  return null;
}

export function adminSessionCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 8 * 60 * 60, path: "/" };
}

export function adminSessionCookieName() { return sessionCookieName; }

function fingerprint(passwordHash: string) { return createHash("sha256").update(passwordHash).digest("hex"); }
