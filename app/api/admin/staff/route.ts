import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

const staffSchema = z.object({
  id: z.number().optional(),
  username: z.string().min(3).max(80),
  password: z.string().min(8).optional().or(z.literal("")),
  displayName: z.string().min(2).max(160),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(32).optional().or(z.literal("")),
  status: z.enum(["active", "suspended", "deleted"]),
  roleId: z.number().positive(),
});

export async function GET(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const staff = await query(
    "SELECT s.id, s.username, s.display_name displayName, s.email, s.phone, s.status, s.role_id roleId, r.code roleCode, r.name_th roleNameTh, r.name_en roleNameEn, s.created_at createdAt FROM admin_staff s JOIN admin_roles r ON r.id = s.role_id WHERE s.status <> 'deleted' ORDER BY s.id DESC",
  );
  return NextResponse.json({ staff });
}

export async function POST(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof staffSchema> & { password: string };
  try {
    body = await parseJsonBody(request, staffSchema.extend({ password: z.string().min(8) }));
  } catch (error) {
    return validationErrorResponse(error);
  }
  const passwordHash = await hashPassword(body.password);

  await query(
    "INSERT INTO admin_staff (username, password_hash, display_name, email, phone, status, role_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [body.username, passwordHash, body.displayName, body.email || null, body.phone || null, body.status, body.roleId],
  );
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('staff.create', 'admin_staff', ?, JSON_OBJECT('username', ?))", [
    body.username,
    body.username,
  ]);

  return GET(request);
}

export async function PUT(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof staffSchema> & { id: number };
  try {
    body = await parseJsonBody(request, staffSchema.extend({ id: z.number().positive() }));
  } catch (error) {
    return validationErrorResponse(error);
  }
  if (body.password) {
    const passwordHash = await hashPassword(body.password);
    await query(
      "UPDATE admin_staff SET username = ?, password_hash = ?, display_name = ?, email = ?, phone = ?, status = ?, role_id = ? WHERE id = ?",
      [body.username, passwordHash, body.displayName, body.email || null, body.phone || null, body.status, body.roleId, body.id],
    );
  } else {
    await query(
      "UPDATE admin_staff SET username = ?, display_name = ?, email = ?, phone = ?, status = ?, role_id = ? WHERE id = ?",
      [body.username, body.displayName, body.email || null, body.phone || null, body.status, body.roleId, body.id],
    );
  }
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('staff.update', 'admin_staff', ?, JSON_OBJECT('username', ?))", [
    String(body.id),
    body.username,
  ]);

  return GET(request);
}

export async function DELETE(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ message: "Missing staff id" }, { status: 400 });

  await query("UPDATE admin_staff SET status = 'deleted' WHERE id = ?", [id]);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id) VALUES ('staff.delete', 'admin_staff', ?)", [String(id)]);
  return GET(request);
}
