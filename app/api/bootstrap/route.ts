import { NextResponse } from "next/server";
import { assertApiUser, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  let user;
  try {
    user = await assertApiUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  const [wallet, sports, bookings, coupons, trainers, groups, notifications] = await Promise.all([
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
      "SELECT uc.id, c.name, c.category, uc.remaining_uses remainingUses, uc.expires_at expiresAt FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.user_id = ? AND uc.status = 'active' ORDER BY uc.created_at DESC",
      [user.id],
    ),
    query("SELECT id, slug, name, nickname, role, avatar, image_url imageUrl, experience, zodiac, birth_year birthYear, blood_type bloodType, contact_phone contactPhone, start_price startPrice, CAST(certifications AS CHAR) certifications FROM trainers WHERE active = TRUE ORDER BY id"),
    query(
      "SELECT g.id, g.name, g.level_name levelName, s.name_th sportName FROM groups_clubs g JOIN sports s ON s.id = g.sport_id WHERE g.status = 'active' ORDER BY g.created_at DESC LIMIT 8",
    ),
    query("SELECT id, title, body, status, created_at createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [
      user.id,
    ]),
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
  });
}
