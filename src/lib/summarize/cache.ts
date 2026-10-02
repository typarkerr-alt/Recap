import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { gzipSync, gunzipSync } from "zlib";
import { Redis } from "@upstash/redis";
import type { BookContent, Chapter, SourceId, SummaryOptions, SummaryScope } from "@/types";
import { createVirtualPages } from "../parsing/chapters";

/*
 * Why this changed: on Vercel every request can land on a different serverless
 * instance, so a module-level Map (or /tmp) on one instance is invisible to the
 * next. Uploads 404'd, and caches rarely hit. If Upstash Redis env vars are set
 * (Vercel → Storage → Upstash for Redis), everything is shared across instances.
 * Without them it falls back to per-instance memory, which is fine for local dev.
 */

const VERSION = "v3"; // bump to invalidate everything after parser changes

const TTL = {
  summary: 60 * 60 * 24 * 30, // 30 days
  notes: 60 * 60 * 24 * 30,
  content: 60 * 60 * 24 * 7,
  upload: 60 * 60 * 24, // 24 hours
};

// globalThis survives hot reloads and is shared between route handlers and pages in dev
const g = globalThis as unknown as {
  __recapRedis?: Redis | null;
  __recapSummaries?: Map<string, string>;
  __recapNotes?: Map<string, string[]>;
  __recapContent?: Map<string, BookContent>;
  __recapUploads?: Map<string, StoredUpload>;
};

const summaries = (g.__recapSummaries ??= new Map());
const notesMem = (g.__recapNotes ??= new Map());
const contentMem = (g.__recapContent ??= new Map());
const uploadMem = (g.__recapUploads ??= new Map());

function getRedis(): Redis | null {
  if (g.__recapRedis !== undefined) return g.__recapRedis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  g.__recapRedis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
  return g.__recapRedis;
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const redis = getRedis();
  if (!redis) return undefined;
  try {
    const raw = await redis.get<string>(key);
    if (!raw) return undefined;
    return JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as T;
  } catch (err) {
    console.warn(`[cache] read failed for ${key}:`, err);
    return undefined;
  }
}

async function kvSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const packed = gzipSync(JSON.stringify(value)).toString("base64");
    await redis.set(key, packed, { ex: ttlSeconds });
  } catch (err) {
    // e.g. value larger than the Redis plan's max request size — degrade to memory only
    console.warn(`[cache] write failed for ${key}:`, err);
  }
}

function lruGet<V>(map: Map<string, V>, key: string): V | undefined {
  const v = map.get(key);
  if (v !== undefined) {
    map.delete(key);
    map.set(key, v);
  }
  return v;
}

function lruSet<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

// ─── Summaries ───────────────────────────────────────────────────────────────

export function makeCacheKey(
  bookId: string,
  sourceId: string,
  scope: SummaryScope,
  options: SummaryOptions,
  extra?: string
): string {
  return [
    "sum",
    VERSION,
    sourceId,
    bookId,
    scope,
    options.length,
    options.format,
    options.spoilerFree ? "sf" : "",
    extra ?? "",
  ].join(":");
}

export async function getCached(key: string): Promise<string | undefined> {
  const mem = lruGet(summaries, key);
  if (mem) return mem;
  const remote = await kvGet<string>(key);
  if (remote) lruSet(summaries, key, remote, 200);
  return remote;
}

export async function setCached(key: string, value: string): Promise<void> {
  lruSet(summaries, key, value, 200);
  await kvSet(key, value, TTL.summary);
}

// ─── Whole-book section notes (reused across length/format choices) ─────────

export function makeNotesKey(sourceId: string, bookId: string): string {
  return ["notes", VERSION, sourceId, bookId].join(":");
}

export async function getCachedNotes(key: string): Promise<string[] | undefined> {
  return lruGet(notesMem, key) ?? (await kvGet<string[]>(key));
}

export async function setCachedNotes(key: string, notes: string[]): Promise<void> {
  lruSet(notesMem, key, notes, 50);
  await kvSet(key, notes, TTL.notes);
}

// ─── Book content (fetched external books) ───────────────────────────────────

// Only chapters are stored remotely; virtual pages are rebuilt on read (halves the size)
interface StoredContent {
  bookId: string;
  sourceId: SourceId;
  chapters: Chapter[];
  totalWordCount: number;
}

function hydrate(s: StoredContent): BookContent {
  return { ...s, virtualPages: createVirtualPages(s.chapters) };
}

function dehydrate(c: BookContent): StoredContent {
  return { bookId: c.bookId, sourceId: c.sourceId, chapters: c.chapters, totalWordCount: c.totalWordCount };
}

export async function getCachedContent(key: string): Promise<BookContent | undefined> {
  const fullKey = `content:${VERSION}:${key}`;
  const mem = lruGet(contentMem, fullKey);
  if (mem) return mem;
  const stored = await kvGet<StoredContent>(fullKey);
  if (!stored) return undefined;
  const content = hydrate(stored);
  lruSet(contentMem, fullKey, content, 20);
  return content;
}

export async function setCachedContent(key: string, content: BookContent): Promise<void> {
  const fullKey = `content:${VERSION}:${key}`;
  lruSet(contentMem, fullKey, content, 20);
  await kvSet(fullKey, dehydrate(content), TTL.content);
}

// ─── Uploads ─────────────────────────────────────────────────────────────────

interface StoredUpload {
  title: string;
  content: StoredContent;
}

const UPLOAD_DIR = join(tmpdir(), "recap-uploads");

export async function storeUpload(id: string, content: BookContent, title: string): Promise<void> {
  const record: StoredUpload = { title, content: dehydrate(content) };
  lruSet(uploadMem, id, record, 20);

  if (getRedis()) {
    await kvSet(`upload:${VERSION}:${id}`, record, TTL.upload);
    return;
  }

  // Local-dev fallback
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(join(UPLOAD_DIR, `${id}.json`), JSON.stringify(record), "utf-8");
  } catch {
    /* memory only */
  }
}

export async function getUpload(id: string): Promise<{ title: string; content: BookContent } | undefined> {
  let record = lruGet(uploadMem, id) ?? (await kvGet<StoredUpload>(`upload:${VERSION}:${id}`));

  if (!record) {
    try {
      const path = join(UPLOAD_DIR, `${id}.json`);
      if (existsSync(path)) record = JSON.parse(readFileSync(path, "utf-8")) as StoredUpload;
    } catch {
      /* not found */
    }
  }

  if (!record) return undefined;
  lruSet(uploadMem, id, record, 20);
  return { title: record.title, content: hydrate(record.content) };
}
