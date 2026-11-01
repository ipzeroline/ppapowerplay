import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";

// Everything a member currently holds, for the front desk (members.manage).
export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const userId = Number(request.nextUrl.searchParams.get("userId"));
  if (!Number.isSafeInteger(userId) || userId <= 0) return NextResponse.json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  const [memberships, pauses, coupons, entitlements, pending] = await Promise.all([
    query("SELECT id, plan_name planName, starts_at startsAt, ends_at endsAt, status FROM memberships WHERE user_id = ? AND status = 'active' AND ends_at > NOW() - INTERVAL 30 DAY ORDER BY ends_at DESC LIMIT 10", [userId]),
    query("SELECT membership_id membershipId, starts_at startsAt, ends_at endsAt, days FROM membership_pauses WHERE user_id = ? AND status = 'active' ORDER BY starts_at DESC LIMIT 10", [userId]),
    query("SELECT uc.id, c.name, uc.remaining_uses remainingUses, COALESCE(uc.total_uses, c.total_uses) totalUses, uc.expires_at expiresAt, uc.status FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.user_id = ? ORDER BY uc.created_at DESC LIMIT 20", [userId]),
    query("SELECT id, entitlement_type entitlementType, title, remaining_uses remainingUses, ends_at endsAt, status FROM user_entitlements WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [userId]),
    query("SELECT payment_no paymentNo, amount, created_at createdAt, slip_uploaded_at slipUploadedAt, JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.itemName')) itemName FROM payments WHERE user_id = ? AND status = 'created' ORDER BY created_at DESC LIMIT 10", [userId]),
  ]);
  return NextResponse.json({ memberships, pauses, coupons, entitlements, pending });
}
