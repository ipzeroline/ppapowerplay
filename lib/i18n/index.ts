import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { messages } from "@/lib/i18n/messages";
import { additionalMessages } from "@/lib/i18n/additional-messages";

export const locales = ["th", "en", "zh"] as const;
export type Locale = typeof locales[number];
export const localeTags: Record<Locale, string> = { th: "th-TH", en: "en-GB", zh: "zh-CN" };
export const allMessages = [...messages, ...additionalMessages];
export const resources = Object.fromEntries(locales.map((locale) => [locale, { translation: Object.fromEntries(allMessages.map(([source, en, zh, th]) => [source, locale === "en" ? en : locale === "zh" ? zh : th || source])) }]));

// The server always renders Thai. Only client effects/events change language,
// avoiding a request-specific locale in shared server state or hydration mismatch.
export const memberI18n = createInstance();
void memberI18n.use(initReactI18next).init({
  resources, lng: "th", fallbackLng: "th", supportedLngs: [...locales],
  initAsync: false, keySeparator: false, nsSeparator: false,
  interpolation: { escapeValue: false }, react: { useSuspense: false },
});

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function currentLocale(): Locale {
  return isLocale(memberI18n.resolvedLanguage) ? memberI18n.resolvedLanguage : "th";
}

export function localeTag() { return localeTags[currentLocale()]; }

export function t(source: string | null | undefined, values?: Record<string, unknown>): string {
  if (!source) return "";
  if (!memberI18n.exists(source)) return source;
  return String(memberI18n.t(source, values || {}));
}

export function localizedContent<T extends { metadata?: unknown }>(item: T): T {
  let metadata = item.metadata;
  if (typeof metadata === "string") { try { metadata = JSON.parse(metadata); } catch { return item; } }
  if (!metadata || typeof metadata !== "object") return item;
  const translations = (metadata as { i18n?: Partial<Record<Locale, Record<string, unknown>>> }).i18n;
  const translated = translations?.[currentLocale()];
  if (!translated || typeof translated !== "object") return item;
  const fields: Record<string, string> = {};
  // Never let translated content replace IDs, prices, routes or permissions.
  for (const key of ["title", "subtitle", "body", "actionLabel", "name", "description"]) {
    if (typeof translated[key] === "string" && translated[key].trim()) fields[key] = translated[key];
  }
  return { ...item, ...fields };
}

export function courtName(name: string) {
  const match = /^(?:สนาม|คอร์ท|Court)\s*(\d+)$/i.exec(name);
  return match ? t("court.name", { number: match[1] }) : t(name);
}
