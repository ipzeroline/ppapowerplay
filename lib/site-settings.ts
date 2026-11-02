// Club settings edited in AdminConsole as content type "site_setting" (read by the member app).
// Safe to import from client components (no server-only dependencies).
import { parseMeta } from "@/lib/package-presentation";
import { rewardCost } from "@/lib/payment-presentation";

type SettingItem = { id: number; contentType: string; slug: string; title: string; subtitle?: string | null; body?: string | null; metadata?: unknown };

export type SupportContact = { phone: string; email: string; line: string; lineUrl: string; hours: string };
export type PrivacyPolicy = { id: number; title: string; summary: string | null; body: string | null; version: string; url: string | null };
export type ConsentState = { acceptedAt: string | null; version: string | null };
// Receipt header (setting "receipt-info"). vatRegistered prints an abbreviated tax invoice with the
// VAT inside the amount; it needs the 13-digit tax ID.
export type ReceiptInfo = { businessName: string; branch: string; address: string; taxId: string; phone: string; vatRegistered: boolean; footer: string };

// What the app shipped with; used until the owner edits the "support-contact" setting.
export const defaultSupportContact: SupportContact = {
  phone: "02-123-4567",
  email: "support@ppapowerplay.com",
  line: "@ppapowerplay",
  lineUrl: "https://line.me/R/ti/p/@ppapowerplay",
  hours: "08:00-21:00",
};

export const defaultReceiptInfo: ReceiptInfo = {
  businessName: "PPA Power Play Sport Club",
  branch: "สำนักงานใหญ่",
  address: "",
  taxId: "",
  phone: "",
  vatRegistered: false,
  footer: "ขอบคุณที่ใช้บริการ",
};

// Stored in users.pdpa_version VARCHAR(20).
export const policyVersionPattern = /^[A-Za-z0-9._-]{1,20}$/;
const phonePattern = /^\+?[0-9][0-9 -]{5,19}$/;
const emailPattern = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const lineIdPattern = /^@[A-Za-z0-9._-]{2,40}$/;
const hoursPattern = /^[^<>]{1,40}$/;
const lineHosts = new Set(["line.me", "lin.ee", "page.line.me"]);

function setting(items: SettingItem[], slug: string) {
  return items.find((item) => item.contentType === "site_setting" && item.slug === slug) || null;
}

function matching(value: unknown, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value.trim()) ? value.trim() : null;
}

function httpsUrl(value: unknown, hosts?: Set<string>) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || (hosts && !hosts.has(url.hostname))) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function supportContact(items: SettingItem[]): SupportContact {
  const meta = parseMeta(setting(items, "support-contact")?.metadata);
  const line = matching(meta.line, lineIdPattern) || defaultSupportContact.line;
  return {
    phone: matching(meta.phone, phonePattern) || defaultSupportContact.phone,
    email: matching(meta.email, emailPattern) || defaultSupportContact.email,
    line,
    lineUrl: httpsUrl(meta.lineUrl, lineHosts) || `https://line.me/R/ti/p/${line}`,
    hours: matching(meta.hours, hoursPattern) || defaultSupportContact.hours,
  };
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}

// 13 digits, written with or without the dashes and spaces printed on the certificate.
function taxIdOf(value: unknown) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

export function receiptInfo(items: SettingItem[]): ReceiptInfo {
  const meta = parseMeta(setting(items, "receipt-info")?.metadata);
  const taxId = taxIdOf(meta.taxId) || "";
  return {
    businessName: text(meta.businessName, 160) || defaultReceiptInfo.businessName,
    branch: text(meta.branch, 80) || defaultReceiptInfo.branch,
    address: text(meta.address, 300) || "",
    taxId,
    phone: matching(meta.phone, phonePattern) || "",
    vatRegistered: meta.vatRegistered === true && Boolean(taxId),
    footer: text(meta.footer, 200) || defaultReceiptInfo.footer,
  };
}

export function telHref(phone: string) {
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${phone.replace(/\D/g, "")}`;
}

// The one reading of metadata.version used by the app and by POST /api/consent, so the version the
// member accepts is always the version the server expects (trimmed text or a whole number).
export function policyVersionOf(metadata: unknown) {
  const version = parseMeta(metadata).version;
  if (typeof version === "number") return Number.isSafeInteger(version) && version >= 0 ? String(version) : null;
  return matching(version, policyVersionPattern);
}

// The published PDPA notice (bootstrap only returns active items), or null when none is active.
export function privacyPolicy(items: SettingItem[]): PrivacyPolicy | null {
  const item = setting(items, "privacy-policy");
  if (!item) return null;
  const version = policyVersionOf(item.metadata);
  if (!version) return null;
  return { id: item.id, title: item.title, summary: item.subtitle || null, body: item.body || null, version, url: httpsUrl(parseMeta(item.metadata).url) };
}

// Members are asked again whenever the owner publishes a new policy version.
export function needsConsent(policy: PrivacyPolicy | null, consent: ConsentState | null | undefined) {
  return Boolean(policy && consent?.version !== policy.version);
}

// AdminConsole save check: settings and rewards the member app would silently ignore are refused.
export function contentProblem(contentType: string, slug: string, metadata: Record<string, unknown>) {
  if (contentType === "reward") {
    return rewardCost(metadata) ? null : "reward: metadata.cost ต้องเป็นจำนวนเต็มบวก (จำนวน Coin)";
  }
  if (contentType !== "site_setting") return null;
  if (slug === "privacy-policy") {
    return policyVersionOf(metadata) ? null : "privacy-policy: metadata.version ต้องเป็นตัวอักษร ตัวเลข . _ - ไม่เกิน 20 ตัว เช่น 2026-11-01";
  }
  if (slug === "support-contact") {
    const checks: [string, boolean][] = [
      ["phone", matching(metadata.phone, phonePattern) !== null],
      ["email", matching(metadata.email, emailPattern) !== null],
      ["line", matching(metadata.line, lineIdPattern) !== null],
      ["lineUrl", httpsUrl(metadata.lineUrl, lineHosts) !== null],
      ["hours", matching(metadata.hours, hoursPattern) !== null],
    ];
    const invalid = checks.filter(([field, ok]) => metadata[field] !== undefined && !ok).map(([field]) => field);
    return invalid.length ? `support-contact: ค่าไม่ถูกต้อง ${invalid.join(", ")} (lineUrl ต้องเป็น https://line.me หรือ https://lin.ee)` : null;
  }
  if (slug === "receipt-info") {
    if (metadata.taxId !== undefined && metadata.taxId !== "" && !taxIdOf(metadata.taxId)) return "receipt-info: taxId ต้องเป็นเลขประจำตัวผู้เสียภาษี 13 หลัก (เว้นว่างได้)";
    if (metadata.vatRegistered !== undefined && typeof metadata.vatRegistered !== "boolean") return "receipt-info: vatRegistered ต้องเป็น true หรือ false";
    if (metadata.vatRegistered === true && !taxIdOf(metadata.taxId)) return "receipt-info: จดทะเบียน VAT ต้องระบุ taxId 13 หลัก";
    if (metadata.phone !== undefined && metadata.phone !== "" && matching(metadata.phone, phonePattern) === null) return "receipt-info: phone ไม่ถูกต้อง";
    return null;
  }
  return null;
}
