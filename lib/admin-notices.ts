// Back-office notices: the four kinds, how long a toast stays, and which toasts stay on screen.
// Staff must not miss a failure, so errors and warnings stay until closed; confirmations of success
// and notes fade by themselves.

export type NoticeTone = "success" | "error" | "warning" | "info";
export type Notice = { tone: NoticeTone; text: string };
export type QueuedNotice = Notice & { id: number };

export const maxToasts = 3;

// The word shown beside the icon, so the kind never depends on colour alone.
export const noticeLabels: Record<"th" | "en", Record<NoticeTone, string>> = {
  th: { success: "สำเร็จ", error: "ไม่สำเร็จ", warning: "โปรดตรวจสอบ", info: "แจ้งให้ทราบ" },
  en: { success: "Success", error: "Error", warning: "Warning", info: "Info" },
};

export function noticeLifetime(tone: NoticeTone): number | null {
  return tone === "success" || tone === "info" ? 6000 : null;
}

// Newest last. The same message again replaces the old copy (a second click does not stack it).
// Over the limit, the oldest fading notice makes room first, so an unread error stays.
export function queueNotice(queue: QueuedNotice[], notice: Notice, id: number): QueuedNotice[] {
  const next = [...queue.filter((item) => item.tone !== notice.tone || item.text !== notice.text), { ...notice, id }];
  while (next.length > maxToasts) {
    const fading = next.findIndex((item) => noticeLifetime(item.tone) !== null);
    next.splice(fading >= 0 && fading < next.length - 1 ? fading : 0, 1);
  }
  return next;
}

export function dismissNotice(queue: QueuedNotice[], id: number): QueuedNotice[] {
  return queue.filter((item) => item.id !== id);
}
