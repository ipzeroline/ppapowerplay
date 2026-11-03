"use client";

import { AdminDialog } from "@/components/admin-dialog";

// In-app confirmation for important member actions (paying, redeeming, cancelling, leaving, logging
// out). Callers pass text already translated with t(). Cancel is focused first, so a stray tap or
// Enter never confirms; the confirm button names exactly what will happen.
export type ConfirmRequest = {
  title: string;
  message?: string;
  details?: [string, string][];
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  return (
    <AdminDialog onClose={onClose}>
      <section className="member-confirm">
        <h2>{request.title}</h2>
        {request.message ? <p>{request.message}</p> : null}
        {request.details?.length ? (
          <dl className="confirm-details">
            {request.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        ) : null}
        {request.note ? <small>{request.note}</small> : null}
        <div>
          <button type="button" className="ghost" onClick={onClose}>{request.cancelLabel}</button>
          <button type="button" className={request.danger ? "danger-action" : "primary"} onClick={() => { onClose(); request.onConfirm(); }}>{request.confirmLabel}</button>
        </div>
      </section>
    </AdminDialog>
  );
}
