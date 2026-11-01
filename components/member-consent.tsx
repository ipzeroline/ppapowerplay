"use client";
import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import { telHref, type PrivacyPolicy, type SupportContact } from "@/lib/site-settings";

// PDPA notice as a native modal <dialog>: focus stays inside and the app behind is inert.
// With onAccept it is the consent step (Esc does not close it); with onClose it is the
// read-only view opened from Help. The club contact is always reachable from inside it.
export function PrivacyPolicyDialog({ policy, contact, busy, onAccept, onClose }: { policy: PrivacyPolicy; contact: SupportContact; busy: boolean; onAccept?: () => void; onClose?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="consent-dialog"
      aria-labelledby="consent-title"
      onCancel={(event) => { event.preventDefault(); onClose?.(); }}
      onClose={() => {
        // Chrome closes a dialog on a repeated Esc even when cancel is prevented: required consent opens again.
        const dialog = ref.current;
        if (onAccept && dialog?.isConnected && !dialog.open) dialog.showModal();
      }}
    >
      <section className="consent-card">
        <h2 id="consent-title">🔒 {policy.title}</h2>
        {policy.summary ? <p className="consent-summary">{policy.summary}</p> : null}
        {policy.body ? <div className="consent-body" tabIndex={0}>{policy.body}</div> : null}
        <div className="consent-meta">
          <small>{t("ฉบับ {{value0}}", { value0: policy.version })}</small>
          {policy.url ? <a href={policy.url} target="_blank" rel="noreferrer">{t("อ่านนโยบายฉบับเต็ม")}</a> : null}
        </div>
        <p className="consent-contact">
          {t("มีคำถามเรื่องข้อมูลส่วนบุคคล ติดต่อ")} <a href={telHref(contact.phone)}>{contact.phone}</a> · <a href={contact.lineUrl} target="_blank" rel="noreferrer">LINE {contact.line}</a>
        </p>
        {onAccept ? <button type="button" className="primary" disabled={busy} onClick={onAccept}>{busy ? t("กำลังบันทึก...") : t("ยอมรับและใช้งานต่อ")}</button> : null}
        {onClose ? <button type="button" className="ghost" onClick={onClose}>{t("ปิด")}</button> : null}
      </section>
    </dialog>
  );
}
