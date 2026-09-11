"use client";

import { useEffect } from "react";
import { Languages, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { currentLocale, isLocale, memberI18n, t, type Locale } from "@/lib/i18n";

const preferenceKey = "ppa.locale";

export function useMemberLocale() {
  useTranslation(undefined, { i18n: memberI18n });
  return currentLocale();
}

export function MemberLocaleSync() {
  const locale = useMemberLocale();
  useEffect(() => {
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (isLocale(saved)) void memberI18n.changeLanguage(saved);
    } catch { /* Language switching still works when storage is restricted. */ }
    const onStorage = (event: StorageEvent) => {
      if (event.key === preferenceKey && isLocale(event.newValue)) void memberI18n.changeLanguage(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  }, [locale]);
  return null;
}

export function LanguageSwitcher() {
  const locale = useMemberLocale();
  function change(value: string) {
    if (!isLocale(value)) return;
    void memberI18n.changeLanguage(value);
    try { localStorage.setItem(preferenceKey, value); } catch { /* Session-only preference. */ }
  }
  const short: Record<Locale, string> = { th: "ไทย", en: "EN", zh: "中文" };
  return <label className="language-switcher" title={t("language")}>
    <Languages size={17} aria-hidden="true" /><span aria-hidden="true">{short[locale]}</span><ChevronDown size={13} aria-hidden="true" />
    <select aria-label={t("language")} value={locale} onChange={(event) => change(event.target.value)}>
      <option value="th" lang="th">ไทย</option><option value="en" lang="en">English</option><option value="zh" lang="zh-CN">简体中文</option>
    </select>
  </label>;
}
