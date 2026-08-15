export type InsightCacheEntry<T> = {
  expiresAt: number;
  signature: string;
  value: T;
};

export function createBoundedInsightCache<T>(maxEntries = 3) {
  const entries = new Map<string, InsightCacheEntry<T>>();

  return {
    get(key: string, signature: string, now = Date.now()) {
      const entry = entries.get(key);
      if (!entry || entry.signature !== signature || entry.expiresAt <= now) return undefined;
      return entry;
    },
    set(key: string, entry: InsightCacheEntry<T>) {
      entries.delete(key);
      entries.set(key, entry);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    },
    delete(key: string) { entries.delete(key); },
    clear() { entries.clear(); },
    size() { return entries.size; },
  };
}
