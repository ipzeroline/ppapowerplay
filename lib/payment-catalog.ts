import { query } from "@/lib/db";

type Selection = { contentId?: number; trainerId?: number; trainerPackage?: string };
export async function resolvePaymentItem(input: Selection) {
  if (input.contentId && !input.trainerId) {
    const [item] = await query<{ title: string; price: number; contentType: string }>(
      "SELECT title, price, content_type contentType FROM app_content_items WHERE id = ? AND active = TRUE AND price > 0 AND content_type IN ('service_package','class_schedule','membership_plan') LIMIT 1", [input.contentId],
    );
    return item ? { amount: Number(item.price), itemName: item.title, itemType: item.contentType === "membership_plan" ? "membership" : "class" } : null;
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
    return plan ? { amount: plan.price as number, itemName: `PT ${trainer.name} - ${plan.title}`, itemType: "trainer" } : null;
  }
  return null;
}
