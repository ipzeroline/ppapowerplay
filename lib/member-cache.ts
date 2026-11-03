// The member's last app data on this phone, shown at once when they reopen the app while fresh data
// loads. Keyed to the LINE account (the ID token's "sub"), so another account on the same phone never
// sees it; nothing older than a day is shown, and logout removes it.

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = "ppa_member_cache_v1";
export const memberCacheMaxAgeMs = 24 * 3_600_000;
const maxChars = 1_500_000;

function localStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readMemberCache<T>(member: string, store: Store | null = localStore(), now = Date.now()): T | null {
  if (!member || !store) return null;
  try {
    const saved = JSON.parse(store.getItem(key) || "null") as { member?: unknown; savedAt?: unknown; data?: T } | null;
    if (!saved || saved.member !== member || typeof saved.savedAt !== "number") return null;
    if (now - saved.savedAt > memberCacheMaxAgeMs || saved.savedAt - now > 60_000) return null;
    return saved.data ?? null;
  } catch {
    return null;
  }
}

export function writeMemberCache(member: string, data: unknown, store: Store | null = localStore(), now = Date.now()) {
  if (!member || !store) return;
  try {
    const text = JSON.stringify({ member, savedAt: now, data });
    if (text.length > maxChars) store.removeItem(key);
    else store.setItem(key, text);
  } catch {
    // Full or blocked storage: the next open simply loads normally.
  }
}

export function clearMemberCache(store: Store | null = localStore()) {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing saved to remove.
  }
}
