"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function AdminDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const title = dialog.querySelector("h2");
    if (title) title.id = titleId;
    dialog.showModal();
    return () => dialog.close();
  }, [titleId]);
  return (
    <dialog ref={ref} className="admin-modal-backdrop" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')).filter((node) => node.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      {children}
    </dialog>
  );
}
