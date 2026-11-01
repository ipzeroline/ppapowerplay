import type mysql from "mysql2/promise";
import { legacyMembershipMonths, type CatalogGrant } from "@/lib/package-grant";

type GrantOptions = {
  amount: number;
  itemName: string;
  itemType?: string | null;
  paymentId?: number | null;
  userId: number;
  // Grant terms copied from the catalog when the payment was created.
  grant?: CatalogGrant;
};

export async function grantPaidEntitlement(connection: mysql.PoolConnection, options: GrantOptions) {
  const type = normalizeEntitlementType(options.itemType, options.itemName);
  if (type === "topup" || type === "booking" || !options.itemName.trim()) return;
  const grant = options.grant || {};

  if (type === "membership") {
    const months = grant.months ?? legacyMembershipMonths(options.itemName);
    const metadata = {
      amount: options.amount,
      source: "payment",
      months,
      ...(grant.pausesAllowed !== undefined ? { pausesAllowed: grant.pausesAllowed } : {}),
      ...(grant.services ? { services: grant.services } : {}),
    };
    await connection.execute(
      "INSERT INTO memberships (user_id, payment_id, plan_name, starts_at, ends_at, status, metadata) VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH), 'active', ?)",
      [options.userId, options.paymentId || null, options.itemName.trim().slice(0, 120), months, JSON.stringify(metadata)],
    );
    return;
  }

  const uses = grant.uses !== undefined ? grant.uses : type === "time_pass" ? null : entitlementUses(options.itemName);
  const days = grant.days ?? entitlementDays(type);
  const metadata = { amount: options.amount, source: "payment", ...(grant.services ? { services: grant.services } : {}) };
  await connection.execute(
    "INSERT INTO user_entitlements (user_id, payment_id, entitlement_type, title, remaining_uses, ends_at, status, metadata) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 'active', ?)",
    [options.userId, options.paymentId || null, type, options.itemName.trim().slice(0, 180), uses, days, JSON.stringify(metadata)],
  );
}

function normalizeEntitlementType(itemType?: string | null, itemName = "") {
  if (itemType) return itemType;
  const text = itemName.toLowerCase();
  if (text.includes("topup") || text.includes("เติมเงิน")) return "topup";
  if (text.includes("booking") || text.includes("court") || text.includes("สนาม")) return "booking";
  if (text.includes("premium") || text.includes("monthly") || text.includes("quarterly") || text.includes("annual") || text.includes("สมาชิก")) return "membership";
  if (text.includes("coupon") || text.includes("คูปอง")) return "coupon";
  if (text.includes("pt ") || text.includes("trainer")) return "trainer";
  return "class";
}

function entitlementUses(itemName: string) {
  const matched = itemName.match(/\b(\d{1,3})\b/);
  return matched ? Number(matched[1]) : 1;
}

function entitlementDays(type: string) {
  if (type === "time_pass") return 1;
  if (type === "trainer") return 180;
  if (type === "coupon") return 60;
  return 45;
}

// Coupon rights for a paid purchase (counter sale or staff-confirmed payment), using the
// terms shown at the time of sale.
export async function grantCoupon(connection: Pick<mysql.PoolConnection, "execute">, input: { userId: number; couponId: number; totalUses: number; validityDays: number; paymentId: number | null }) {
  await connection.execute(
    "INSERT INTO user_coupons (user_id, coupon_id, total_uses, payment_id, remaining_uses, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
    [input.userId, input.couponId, input.totalUses, input.paymentId, input.totalUses, input.validityDays],
  );
}
