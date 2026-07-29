import type { ICacheService } from "./cache.service";

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

export class MemoryCacheService implements ICacheService {
  private cache = new Map<string, CacheEntry<any>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
