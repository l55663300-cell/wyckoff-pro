interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  const entry: CacheEntry<T> = {
    data,
    expiry: Date.now() + ttlSeconds * 1000,
  };
  sessionStorage.setItem(key, JSON.stringify(entry));
}

export function getCache<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  const entry: CacheEntry<T> = JSON.parse(raw);
  if (Date.now() > entry.expiry) {
    sessionStorage.removeItem(key);
    return null;
  }
  return entry.data;
}

export function clearCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    sessionStorage.clear();
    return;
  }
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith(keyPrefix))
    .forEach((k) => sessionStorage.removeItem(k));
}
