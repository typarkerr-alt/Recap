import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BookContent, SummaryOptions, SummaryScope } from "@/types";

// ─── Summary cache (in-memory, up to 200 entries) ───────────────────────────

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

// ─── Book content cache (in-memory, up to 20 fetched external books) ─────────

const contentCache = new Map<string, BookContent>();

export function getCachedContent(key: string): BookContent | undefined {
  return contentCache.get(key);
}

export function setCachedContent(key: string, content: BookContent): void {
  if (contentCache.size >= 20) {
    const first = contentCache.keys().next().value;
    if (first) contentCache.delete(first);
  }
  contentCache.set(key, content);
}

// ─── Upload store (/tmp with in-memory fallback) ─────────────────────────────

const UPLOAD_DIR = join(tmpdir(), "recap-uploads");
const uploadMemory = new Map<string, BookContent>(); // fallback if /tmp unavailable

function ensureUploadDir(): boolean {
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function storeUpload(id: string, content: BookContent): void {
  // Try filesystem first — survives within the same container lifetime
  if (ensureUploadDir()) {
    try {
      writeFileSync(join(UPLOAD_DIR, `${id}.json`), JSON.stringify(content), "utf-8");
      return;
    } catch {
      // fall through to memory
    }
  }
  uploadMemory.set(id, content);
}

export function getUpload(id: string): BookContent | undefined {
  // Try filesystem first
  try {
    const path = join(UPLOAD_DIR, `${id}.json`);
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as BookContent;
    }
  } catch {
    // fall through
  }
  return uploadMemory.get(id);
}
