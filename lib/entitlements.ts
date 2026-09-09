import type mysql from "mysql2/promise";

type GrantOptions = {
  amount: number;
  itemName: string;
  itemType?: string | null;
  paymentId?: number | null;
  userId: number;
};

export async function grantPaidEntitlement(connection: mysql.PoolConnection, options: GrantOptions) {
  const type = normalizeEntitlementType(options.itemType, options.itemName);
  if (type === "topup" || type === "booking" || !options.itemName.trim()) return;

  if (type === "membership") {
    const months = membershipMonths(options.itemName);
    await connection.execute(
      "INSERT INTO memberships (user_id, payment_id, plan_name, starts_at, ends_at, status, metadata) VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH), 'active', JSON_OBJECT('amount', ?, 'source', 'payment'))",
      [options.userId, options.paymentId || null, options.itemName.trim().slice(0, 120), months, options.amount],
    );
    return;
  }

  await connection.execute(
    "INSERT INTO user_entitlements (user_id, payment_id, entitlement_type, title, remaining_uses, ends_at, status, metadata) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 'active', JSON_OBJECT('amount', ?, 'source', 'payment'))",
    [options.userId, options.paymentId || null, type, options.itemName.trim().slice(0, 180), entitlementUses(options.itemName), entitlementDays(type), options.amount],
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

function membershipMonths(itemName: string) {
  const text = itemName.toLowerCase();
  if (text.includes("annual")) return 12;
  if (text.includes("quarter")) return 3;
  return 1;
}

function entitlementUses(itemName: string) {
  const matched = itemName.match(/\b(\d{1,3})\b/);
  return matched ? Number(matched[1]) : 1;
}

function entitlementDays(type: string) {
  if (type === "trainer") return 180;
  if (type === "coupon") return 60;
  return 45;
}
