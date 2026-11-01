import { query } from "@/lib/db";
import { normalizeGrant, type CatalogGrant } from "@/lib/package-grant";

type Selection = { contentId?: number; trainerId?: number; trainerPackage?: string };
export type PaymentItemType = "membership" | "time_pass" | "class" | "trainer";
export type CatalogPaymentItem = { amount: number; itemName: string; itemType: PaymentItemType; contentId?: number; grant: CatalogGrant };

// Renewal options (package pause, coupon renewal) are intentionally excluded: they
// need ownership checks and are sold only through their own endpoints.
const purchasableContentTypes = "('service_package','class_schedule','membership_plan','time_pass')";

function itemTypeFor(contentType: string): PaymentItemType {
  if (contentType === "membership_plan") return "membership";
  if (contentType === "time_pass") return "time_pass";
  return "class";
}

export async function resolvePaymentItem(input: Selection): Promise<CatalogPaymentItem | null> {
  if (input.contentId && !input.trainerId) {
    const [item] = await query<{ title: string; price: number; contentType: string; metadata?: string | null }>(
      `SELECT title, price, content_type contentType, CAST(metadata AS CHAR) metadata FROM app_content_items WHERE id = ? AND active = TRUE AND price > 0 AND content_type IN ${purchasableContentTypes} LIMIT 1`, [input.contentId],
    );
    return item ? { amount: Number(item.price), itemName: item.title, itemType: itemTypeFor(item.contentType), contentId: input.contentId, grant: normalizeGrant(item.metadata) } : null;
  }
  if (input.trainerId && input.trainerPackage && !input.contentId) {
    const [trainer] = await query<{ name: string; packages: string }>(
      "SELECT name, CAST(packages AS CHAR) packages FROM trainers WHERE id = ? AND active = TRUE LIMIT 1", [input.trainerId],
    );
    if (!trainer) return null;
    let packages: unknown;
    try { packages = JSON.parse(trainer.packages); } catch { return null; }
    if (!Array.isArray(packages)) return null;
    const plan = packages.find((item) => item && item.title === input.trainerPackage && typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0);
    return plan ? { amount: plan.price as number, itemName: `PT ${trainer.name} - ${plan.title}`, itemType: "trainer", grant: {} } : null;
  }
  return null;
}
