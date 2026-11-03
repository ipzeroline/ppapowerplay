"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { noticeLabels, type NoticeTone } from "@/lib/admin-notices";

type Lang = "th" | "en";

const icons = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info } as const;
const closeLabels: Record<Lang, string> = { th: "ปิดการแจ้งเตือน", en: "Dismiss notice" };

// The console's language, for notices rendered without one (set by AdminFeedbackProvider).
export const NoticeLanguage = createContext<Lang>("th");

// Every back-office message: tinted by kind (success green, error red, warning amber, note blue),
// with an icon and the kind in words. Errors and warnings are announced at once (alert); successes
// and notes politely (status).
export function AdminNotice({ tone, lang, children, action, onClose, className }: {
  tone: NoticeTone;
  lang?: Lang;
  children: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const consoleLang = useContext(NoticeLanguage);
  const language = lang ?? consoleLang;
  const Icon = icons[tone];
  return (
    <div className={`admin-notice ${tone}${className ? ` ${className}` : ""}`} role={tone === "error" || tone === "warning" ? "alert" : "status"}>
      <Icon className="admin-notice-icon" aria-hidden="true" />
      <div className="admin-notice-body">
        <b className="admin-notice-label">{noticeLabels[language][tone]}</b>
        <div className="admin-notice-text">{children}</div>
      </div>
      {action ? <div className="admin-notice-action">{action}</div> : null}
      {onClose ? <button type="button" className="admin-notice-close" aria-label={closeLabels[language]} onClick={onClose}><X aria-hidden="true" /></button> : null}
    </div>
  );
}
