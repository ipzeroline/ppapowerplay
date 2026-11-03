"use client";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import { localeTag, t } from "@/lib/i18n";

// Small presentational pieces shared by the member app screens.

export const titleIcons: [string, string][] = [
  ["เลือกกีฬา", "🏟️"],
  ["จองสนาม", "📅"],
  ["วันที่", "⏱️"],
  ["สรุป", "🧾"],
  ["Check In", "✅"],
  ["ประวัติ", "📋"],
  ["Gymnos", "🏋️"],
  ["Fitness", "💪"],
  ["Swim", "🏊"],
  ["HYROX", "🔥"],
  ["Pilates", "🤸"],
  ["Airfit", "🪂"],
  ["Promotion", "🎁"],
  ["Live TV", "📺"],
  ["Wallet", "👛"],
  ["Coupon", "🎫"],
  ["Points", "🏆"],
  ["Membership", "💎"],
  ["Plans", "📦"],
  ["Trainer", "🧑‍🏫"],
  ["Find Your Game", "👥"],
  ["Notification", "🔔"],
  ["Profile", "👤"],
  ["Admin", "⚙️"],
];

export const sectionIcons: [string, string][] = [
  ["วันนี้", "📍"],
  ["บริการ", "🧭"],
  ["คลาส", "🗓️"],
  ["เวลา", "⏱️"],
  ["ดีล", "🎁"],
  ["เติมเงิน", "💳"],
  ["คูปอง", "🎫"],
  ["ก๊วน", "👥"],
  ["Schedule", "📅"],
];

export function money(amount: number | string | undefined) {
  return Number(amount || 0).toLocaleString(localeTag());
}

export function iconFor(title: string, options: [string, string][]) {
  return options.find(([key]) => title.includes(key))?.[1] || "•";
}

export function Top({ title, onBack, icon }: { title: string; onBack?: () => void; icon?: string }) {
  const marker = icon || iconFor(title, titleIcons);
  return (
    <header className="top">
      {onBack ? <button className="back-btn" title={t("ย้อนกลับ")} aria-label={t("ย้อนกลับ")} onClick={onBack}><ChevronLeft size={22} aria-hidden="true" /></button> : <span />}
      <div className="top-title">
        <i>{t(marker)}</i>
        <h1>{icon ? `${icon} ${t(title)}` : t(title)}</h1>
      </div>
      <span />
    </header>
  );
}

export function SectionTitle({ title, action, onClick, icon }: { title: string; action?: string; onClick?: () => void; icon?: string }) {
  const marker = icon || iconFor(title, sectionIcons);
  return (
    <div className="section-title">
      <h2><span>{t(marker)}</span>{t(title)}</h2>
      {t(action) && <button onClick={onClick}>{t(action)}</button>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="empty small">∅ {t(text)}</div>;
}

// Loading in words with an icon: "กำลังโหลด…" next to a turning circle (still when motion is reduced).
export function Spinner() {
  return <LoaderCircle className="member-spinner" aria-hidden="true" />;
}

export function LoadingNote({ text, className = "" }: { text: string; className?: string }) {
  return <p className={`member-loading-note ${className}`.trim()} role="status"><Spinner />{text}</p>;
}
