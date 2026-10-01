import type { SummaryOptions, SummaryScope } from "@/types";

const MAX_ENTRIES = 200;

const cache = new Map<string, string>();
const order: string[] = [];

export function makeCacheKey(
  bookId: string,
  sourceId: string,
  scope: SummaryScope,
  options: SummaryOptions,
  extra?: string
): string {
  return [bookId, sourceId, scope, options.length, options.format, options.spoilerFree ? "sf" : "", extra ?? ""].join(
    ":"
  );
}

export function getCached(key: string): string | undefined {
  return cache.get(key);
}

export function setCached(key: string, value: string): void {
  if (cache.size >= MAX_ENTRIES) {
    const evict = order.shift();
    if (evict) cache.delete(evict);
  }
  cache.set(key, value);
  order.push(key);
}

// In-memory upload store (book content keyed by upload session ID)
const uploadStore = new Map<string, import("@/types").BookContent>();

export function storeUpload(id: string, content: import("@/types").BookContent): void {
  uploadStore.set(id, content);
}

export function getUpload(id: string): import("@/types").BookContent | undefined {
  return uploadStore.get(id);
}

// In-memory book content cache (fetched external books)
const contentCache = new Map<string, import("@/types").BookContent>();

export function getCachedContent(key: string): import("@/types").BookContent | undefined {
  return contentCache.get(key);
}

export function setCachedContent(key: string, content: import("@/types").BookContent): void {
  if (contentCache.size >= 20) {
    const first = contentCache.keys().next().value;
    if (first) contentCache.delete(first);
  }
  contentCache.set(key, content);
}
