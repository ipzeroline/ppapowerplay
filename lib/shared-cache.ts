// Short-lived, per-process cache for data that is the same for every member (the app catalog).
// A burst of app opens shares one database read: concurrent misses wait on the same load, and a
// failed load is not kept, so the next request tries again.

type Entry = { expires: number; value?: unknown; pending?: Promise<unknown> };
const entries = new Map<string, Entry>();

export function sharedCache<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const entry = entries.get(key);
  if (entry?.pending) return entry.pending as Promise<T>;
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.value as T);
  const pending = load().then(
    (value) => {
      entries.set(key, { expires: Date.now() + ttlMs, value });
      return value;
    },
    (error: unknown) => {
      entries.delete(key);
      throw error;
    },
  );
  entries.set(key, { expires: 0, pending });
  return pending;
}

// After staff change the catalog, this server shows it at once (other processes within the TTL).
export function clearSharedCache() {
  entries.clear();
}
