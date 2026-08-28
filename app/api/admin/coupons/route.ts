import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { parseJsonBody, validationErrorResponse } from "@/lib/security";

const couponSchema = z.object({
  id: z.number().positive().optional(),
  code: z.string().min(3).max(64),
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(80),
  price: z.number().min(0),
  totalUses: z.number().int().min(1).max(999),
  validityDays: z.number().int().min(1).max(3650),
  active: z.boolean(),
});

export async function GET(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;
  return NextResponse.json({ coupons: await loadCoupons() });
}

export async function POST(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof couponSchema>;
  try {
    body = await parseJsonBody(request, couponSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  await query(
    "INSERT INTO coupons (code, name, category, price, total_uses, validity_days, active) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [body.code, body.name, body.category, body.price, body.totalUses, body.validityDays, body.active],
  );
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('coupon.create', 'coupons', ?, JSON_OBJECT('code', ?))", [
    body.code,
    body.code,
  ]);
  return NextResponse.json({ coupons: await loadCoupons() });
}

export async function PUT(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  let body: z.infer<typeof couponSchema> & { id: number };
  try {
    body = await parseJsonBody(request, couponSchema.extend({ id: z.number().positive() }));
  } catch (error) {
    return validationErrorResponse(error);
  }
  await query(
    "UPDATE coupons SET code = ?, name = ?, category = ?, price = ?, total_uses = ?, validity_days = ?, active = ? WHERE id = ?",
    [body.code, body.name, body.category, body.price, body.totalUses, body.validityDays, body.active, body.id],
  );
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id, metadata) VALUES ('coupon.update', 'coupons', ?, JSON_OBJECT('code', ?))", [
    String(body.id),
    body.code,
  ]);
  return NextResponse.json({ coupons: await loadCoupons() });
}

export async function DELETE(request: NextRequest) {
  const denied = assertAdminRequest(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ message: "Missing coupon id" }, { status: 400 });

  await query("UPDATE coupons SET active = FALSE WHERE id = ?", [id]);
  await query("INSERT INTO admin_audit_logs (action, target_type, target_id) VALUES ('coupon.delete', 'coupons', ?)", [String(id)]);
  return NextResponse.json({ coupons: await loadCoupons() });
}

function loadCoupons() {
  return query("SELECT id, code, name, category, price, total_uses totalUses, validity_days validityDays, active FROM coupons ORDER BY id DESC LIMIT 200");
}
