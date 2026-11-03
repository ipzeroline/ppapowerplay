"use client";

import { useEffect, useId, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { AdminDialog } from "@/components/admin-dialog";
import { AdminNotice } from "@/components/admin-notice";

type Lang = "th" | "en";

export type ConfirmOptions = {
  title: string;
  message?: string;
  // What is about to change, as label and value pairs (member, amount, time…).
  details?: [string, string][];
  // Something staff must know before confirming, shown as a warning notice.
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};

const backLabels: Record<Lang, string> = { th: "กลับ", en: "Go back" };

// In-app confirmation for important back-office actions (deleting, check-in, money). The way back
// comes first and takes the focus, so a stray Enter never confirms; the confirm button says exactly
// what will happen, in red when it cannot be undone.
export function AdminConfirmDialog({ options, lang, onAnswer }: { options: ConfirmOptions; lang: Lang; onAnswer: (confirmed: boolean) => void }) {
  const messageId = useId();
  const back = useRef<HTMLButtonElement>(null);
  // Runs after AdminDialog has opened the dialog (child effects first), whatever the browser's own
  // choice of first focus inside a dialog.
  useEffect(() => back.current?.focus(), []);
  return (
    <AdminDialog role="alertdialog" describedBy={options.message ? messageId : undefined} onClose={() => onAnswer(false)}>
      <section className={`admin-modal admin-confirm${options.danger ? " danger" : ""}`}>
        <header>
          {options.danger ? <div className="admin-confirm-icon" aria-hidden="true"><TriangleAlert /></div> : null}
          <div>
            <h2>{options.title}</h2>
            {options.message ? <span id={messageId}>{options.message}</span> : null}
          </div>
        </header>
        {options.details?.length || options.warning ? (
          <div className="admin-confirm-body">
            {options.details?.length ? (
              <dl className="admin-confirm-details">
                {options.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
            ) : null}
            {options.warning ? <AdminNotice tone="warning" lang={lang}>{options.warning}</AdminNotice> : null}
          </div>
        ) : null}
        <footer className="admin-confirm-actions">
          <button ref={back} type="button" className="admin-button" onClick={() => onAnswer(false)}>{options.cancelLabel ?? backLabels[lang]}</button>
          <button type="button" className={options.danger ? "admin-button danger" : "primary"} onClick={() => onAnswer(true)}>{options.confirmLabel}</button>
        </footer>
      </section>
    </AdminDialog>
  );
}
