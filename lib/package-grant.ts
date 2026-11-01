// Grant terms attached to a purchasable catalog item (app_content_items.metadata).
// The server reads them at checkout and copies them into the payment so that later
// catalog edits never change rights that were already paid for.
export type CatalogGrant = {
  months?: number;
  days?: number;
  uses?: number | null;
  services?: string[];
  pausesAllowed?: number;
};

const servicePattern = /^[a-z][a-z0-9-]{0,31}$/;

function integerIn(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

export function normalizeGrant(metadata: unknown): CatalogGrant {
  const source = asRecord(metadata);
  const grant: CatalogGrant = {};
  const months = integerIn(source.months, 1, 36);
  if (months !== undefined) grant.months = months;
  const days = integerIn(source.days, 1, 366);
  if (days !== undefined) grant.days = days;
  if (source.uses === null) grant.uses = null;
  const uses = integerIn(source.uses, 1, 999);
  if (uses !== undefined) grant.uses = uses;
  if (Array.isArray(source.services)) {
    const services = source.services.filter((service): service is string => typeof service === "string" && servicePattern.test(service)).slice(0, 6);
    if (services.length) grant.services = services;
  }
  const pausesAllowed = integerIn(source.pausesAllowed, 0, 4);
  if (pausesAllowed !== undefined) grant.pausesAllowed = pausesAllowed;
  return grant;
}

// Membership length for catalog items created before grant metadata existed.
export function legacyMembershipMonths(itemName: string) {
  const text = itemName.toLowerCase();
  const explicit = /(\d{1,2})\s*(เดือน|months?)/.exec(text);
  if (explicit) {
    const months = Number(explicit[1]);
    if (months >= 1 && months <= 36) return months;
  }
  const years = /(\d{1,2})\s*(ปี|years?)/.exec(text);
  if (years) {
    const months = Number(years[1]) * 12;
    if (months >= 12 && months <= 36) return months;
  }
  if (text.includes("annual") || text.includes("รายปี")) return 12;
  if (text.includes("quarter")) return 3;
  return 1;
}
