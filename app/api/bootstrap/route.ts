import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/security";

export async function GET() {
  const limited = checkRateLimit({ key: `bootstrap:${await clientIp()}`, limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const [wallet, sports, bookings, coupons, trainers, groups, notifications, contentItems, memberships, entitlements] = await Promise.all([
    query<{ balance: number; coinBalance: number; pointBalance: number }>(
      "SELECT balance, coin_balance coinBalance, point_balance pointBalance FROM wallet_accounts WHERE user_id = ? LIMIT 1",
      [user.id],
    ),
    query("SELECT id, slug, name_th name, icon, description, requires_booking requiresBooking, base_rate baseRate FROM sports WHERE active = TRUE ORDER BY sort_order"),
    query(
      "SELECT booking_no bookingNo, title, starts_at startsAt, ends_at endsAt, amount, status FROM bookings WHERE user_id = ? ORDER BY starts_at DESC LIMIT 20",
      [user.id],
    ),
    query(
      "SELECT uc.id, c.name, c.category, uc.remaining_uses remainingUses, uc.expires_at expiresAt FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.user_id = ? AND uc.status = 'active' AND uc.expires_at > NOW() AND uc.remaining_uses > 0 ORDER BY uc.created_at DESC LIMIT 100",
      [user.id],
    ),
    query("SELECT id, slug, name, nickname, role, avatar, image_url imageUrl, experience, zodiac, birth_year birthYear, blood_type bloodType, contact_phone contactPhone, bio, CAST(specialties AS CHAR) specialties, CAST(packages AS CHAR) packages, CAST(weekly_schedule AS CHAR) weeklySchedule, social_line socialLine, start_price startPrice, CAST(certifications AS CHAR) certifications FROM trainers WHERE active = TRUE ORDER BY sort_order, id"),
    query(
      "SELECT g.id, g.name, g.level_name levelName, s.name_th sportName FROM groups_clubs g JOIN sports s ON s.id = g.sport_id WHERE g.status = 'active' ORDER BY g.created_at DESC LIMIT 8",
    ),
    query("SELECT id, title, body, status, created_at createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [
      user.id,
    ]),
    query("SELECT id, content_type contentType, slug, title, subtitle, body, icon, image_url imageUrl, action_label actionLabel, target_screen targetScreen, price, CAST(metadata AS CHAR) metadata, sort_order sortOrder FROM app_content_items WHERE active = TRUE ORDER BY content_type, sort_order, id LIMIT 500"),
    query("SELECT id, plan_name planName, starts_at startsAt, ends_at endsAt, status FROM memberships WHERE user_id = ? AND status = 'active' AND ends_at > NOW() ORDER BY ends_at DESC LIMIT 5", [user.id]),
    query("SELECT id, entitlement_type entitlementType, title, remaining_uses remainingUses, starts_at startsAt, ends_at endsAt, status, CAST(metadata AS CHAR) metadata FROM user_entitlements WHERE user_id = ? AND status = 'active' AND (ends_at IS NULL OR ends_at > NOW()) AND (remaining_uses IS NULL OR remaining_uses > 0) ORDER BY created_at DESC LIMIT 30", [user.id]),
  ]);

  return NextResponse.json({
    user,
    wallet: wallet[0] ?? { balance: 0, coinBalance: 0, pointBalance: 0 },
    sports,
    bookings,
    coupons,
    trainers,
    groups,
    notifications,
    contentItems,
    memberships,
    entitlements,
  });
}
