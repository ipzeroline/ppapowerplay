"use client";

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminConfirmDialog, type ConfirmOptions } from "@/components/admin-confirm";
import { AdminNotice, NoticeLanguage } from "@/components/admin-notice";
import { dismissNotice, noticeLifetime, queueNotice, type NoticeTone, type QueuedNotice } from "@/lib/admin-notices";

type Lang = "th" | "en";
type Feedback = {
  // A result staff should see wherever they are on the page (a toast in the corner of the screen).
  notify: (tone: NoticeTone, text: string) => void;
  // Asks in the app before an important action; resolves true only when staff confirm.
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<Feedback | null>(null);
const regionLabels: Record<Lang, string> = { th: "การแจ้งเตือน", en: "Notifications" };

export function useAdminFeedback(): Feedback {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error("useAdminFeedback must be used inside AdminFeedbackProvider");
  return feedback;
}

// One toast area and one confirmation dialog for the whole console. The toasts sit outside the
// page content, so the phone menu (which makes the page inert) never hides them.
export function AdminFeedbackProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [toasts, setToasts] = useState<QueuedNotice[]>([]);
  const [asking, setAsking] = useState<ConfirmOptions | null>(null);
  const answer = useRef<((confirmed: boolean) => void) | null>(null);
  const lastId = useRef(0);
  const notify = useCallback((tone: NoticeTone, text: string) => {
    lastId.current += 1;
    const id = lastId.current;
    setToasts((queue) => queueNotice(queue, { tone, text }, id));
  }, []);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    answer.current?.(false);
    answer.current = resolve;
    setAsking(options);
  }), []);
  const settle = (confirmed: boolean) => {
    const resolve = answer.current;
    answer.current = null;
    setAsking(null);
    resolve?.(confirmed);
  };
  useEffect(() => {
    const pending = answer;
    return () => pending.current?.(false);
  }, []);
  const feedback = useMemo(() => ({ notify, confirm }), [notify, confirm]);
  return (
    <FeedbackContext.Provider value={feedback}>
      <NoticeLanguage.Provider value={lang}>
        {children}
        <section className="admin-toasts" aria-label={regionLabels[lang]} aria-live="polite">
          {toasts.map((toast) => <Toast key={toast.id} toast={toast} onClose={() => setToasts((queue) => dismissNotice(queue, toast.id))} />)}
        </section>
        {asking ? <AdminConfirmDialog options={asking} lang={lang} onAnswer={settle} /> : null}
      </NoticeLanguage.Provider>
    </FeedbackContext.Provider>
  );
}

// A success fades after a few seconds, but not while the pointer or focus is on it.
function Toast({ toast, onClose }: { toast: QueuedNotice; onClose: () => void }) {
  const [held, setHeld] = useState(false);
  const lifetime = noticeLifetime(toast.tone);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (lifetime === null || held) return;
    const timer = window.setTimeout(() => close(), lifetime);
    return () => window.clearTimeout(timer);
  }, [lifetime, held]);
  return (
    <div className="admin-toast" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <AdminNotice tone={toast.tone} onClose={onClose}>{toast.text}</AdminNotice>
    </div>
  );
}
