import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { listGroups } from "@/lib/groups";
import { promptPayTargetValid } from "@/lib/promptpay";
import { checkRateLimit, clientIp } from "@/lib/security";
import { sharedCache } from "@/lib/shared-cache";

// The catalog is the same for every member: read once a minute per server, not on every app open.
const catalogTtlMs = 60_000;
const catalog = (key: string, sql: string) => sharedCache(`catalog:${key}`, catalogTtlMs, () => query(sql));

const couponColumns = "uc.id, c.code, c.name, c.category, uc.remaining_uses remainingUses, COALESCE(uc.total_uses, c.total_uses) totalUses, uc.created_at purchasedAt, uc.expires_at expiresAt";

export async function GET() {
  const limited = checkRateLimit({ key: `bootstrap:${await clientIp()}`, limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const [wallet, sports, bookings, coupons, expiredCoupons, trainers, groups, notifications, contentItems, memberships, membershipPauses, entitlements, pendingPayments, walletLedger, consent, visits] = await Promise.all([
    query<{ balance: number; coinBalance: number; pointBalance: number }>(
      "SELECT balance, coin_balance coinBalance, point_balance pointBalance FROM wallet_accounts WHERE user_id = ? LIMIT 1",
      [user.id],
    ),
    catalog("sports", "SELECT id, slug, name_th name, icon, description, requires_booking requiresBooking, base_rate baseRate FROM sports WHERE active = TRUE ORDER BY sort_order"),
    query(
      "SELECT booking_no bookingNo, title, starts_at startsAt, ends_at endsAt, amount, status FROM bookings WHERE user_id = ? ORDER BY starts_at DESC LIMIT 20",
      [user.id],
    ),
    query(
      `SELECT ${couponColumns} FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.user_id = ? AND uc.status = 'active' AND uc.expires_at > NOW() AND uc.remaining_uses > 0 ORDER BY uc.created_at DESC LIMIT 100`,
      [user.id],
    ),
    // Recently expired coupons that still have uses can be renewed (lib/renewals.ts).
    query(
      `SELECT ${couponColumns} FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.user_id = ? AND uc.status = 'active' AND uc.remaining_uses > 0 AND uc.expires_at <= NOW() AND uc.expires_at > NOW() - INTERVAL 30 DAY ORDER BY uc.expires_at DESC LIMIT 20`,
      [user.id],
    ),
    catalog("trainers", "SELECT id, slug, name, nickname, role, avatar, image_url imageUrl, experience, zodiac, birth_year birthYear, blood_type bloodType, contact_phone contactPhone, bio, CAST(specialties AS CHAR) specialties, CAST(packages AS CHAR) packages, CAST(weekly_schedule AS CHAR) weeklySchedule, social_line socialLine, start_price startPrice, CAST(certifications AS CHAR) certifications FROM trainers WHERE active = TRUE ORDER BY sort_order, id"),
    listGroups(user.id, 12),
    query("SELECT id, title, body, status, created_at createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [
      user.id,
    ]),
    catalog("content", "SELECT id, content_type contentType, slug, title, subtitle, body, icon, image_url imageUrl, action_label actionLabel, target_screen targetScreen, price, CAST(metadata AS CHAR) metadata, sort_order sortOrder FROM app_content_items WHERE active = TRUE ORDER BY content_type, sort_order, id LIMIT 500"),
    query("SELECT id, plan_name planName, starts_at startsAt, ends_at endsAt, status, CAST(metadata AS CHAR) metadata FROM memberships WHERE user_id = ? AND status = 'active' AND ends_at > NOW() ORDER BY ends_at DESC LIMIT 5", [user.id]),
    // Every pause of a still-active membership (including finished ones) to show used/allowed pauses.
    query("SELECT mp.id, mp.membership_id membershipId, mp.starts_at startsAt, mp.ends_at endsAt, mp.days FROM membership_pauses mp JOIN memberships m ON m.id = mp.membership_id WHERE mp.user_id = ? AND mp.status = 'active' AND m.status = 'active' AND m.ends_at > NOW() ORDER BY mp.starts_at LIMIT 20", [user.id]),
    query("SELECT id, entitlement_type entitlementType, title, remaining_uses remainingUses, starts_at startsAt, ends_at endsAt, status, CAST(metadata AS CHAR) metadata FROM user_entitlements WHERE user_id = ? AND status = 'active' AND (ends_at IS NULL OR ends_at > NOW()) AND (remaining_uses IS NULL OR remaining_uses > 0) ORDER BY created_at DESC LIMIT 30", [user.id]),
    // Requests waiting for staff payment confirmation (shown so members do not resubmit).
    query(
      "SELECT payment_no paymentNo, method, amount, created_at createdAt, slip_uploaded_at slipUploadedAt, COALESCE(JSON_VALUE(metadata, '$.itemType'), JSON_VALUE(metadata, '$.kind')) itemType, JSON_VALUE(metadata, '$.itemName') itemName, COALESCE(JSON_VALUE(metadata, '$.membershipId'), JSON_VALUE(metadata, '$.userCouponId'), JSON_VALUE(metadata, '$.couponId'), JSON_VALUE(metadata, '$.contentId')) refId FROM payments WHERE user_id = ? AND status = 'created' ORDER BY created_at DESC LIMIT 10",
      [user.id],
    ),
    query("SELECT id, kind, amount, coin_delta coinDelta, point_delta pointDelta, note, created_at createdAt FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20", [user.id]),
    // PDPA: the privacy policy version this member accepted (the app asks again for a newer version).
    query<{ acceptedAt: string | null; version: string | null }>("SELECT pdpa_accepted_at acceptedAt, pdpa_version version FROM users WHERE id = ? LIMIT 1", [user.id]),
    // Visit history: recorded when staff scan the member's QR (admin QR verify).
    query("SELECT id, purpose, title, created_at createdAt FROM member_visits WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20", [user.id]),
  ]);

  return NextResponse.json({
    user,
    wallet: wallet[0] ?? { balance: 0, coinBalance: 0, pointBalance: 0 },
    sports,
    bookings,
    coupons,
    expiredCoupons,
    trainers,
    groups,
    notifications,
    contentItems,
    memberships,
    membershipPauses,
    entitlements,
    pendingPayments,
    walletLedger,
    consent: consent[0] ?? { acceptedAt: null, version: null },
    visits,
    // The wallet offers "pay / attach slip" only when the PromptPay QR can be shown.
    promptPayEnabled: promptPayTargetValid(process.env.PROMPTPAY_ID || ""),
  });
}
