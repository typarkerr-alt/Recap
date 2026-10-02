// Shared helpers for talking to library APIs from Vercel functions.

const USER_AGENT = "Recap/1.0 (free public-domain book reader & summarizer)";

type NextInit = RequestInit & { next?: { revalidate?: number | false } };

export class UpstreamError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "UpstreamError";
  }
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** fetch + timeout + JSON check. Library sites sometimes answer with HTML (CAPTCHA/error pages). */
export async function fetchJson<T>(url: string, init: NextInit = {}, timeoutMs = 15_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new UpstreamError(`${host(url)} took too long to respond`);
    }
    throw err;
  }
  if (!res.ok) throw new UpstreamError(`${host(url)} returned ${res.status}`, res.status);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new UpstreamError(`${host(url)} returned a non-JSON response`, 503);
  return (await res.json()) as T;
}

/** Download a (possibly large) text file with a timeout and a size cap. */
export async function fetchText(
  url: string,
  timeoutMs = 30_000,
  maxChars = 6_000_000
): Promise<{ text: string; contentType: string; truncated: boolean }> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store", // books exceed Next's 2 MB fetch-cache limit; we cache parsed chapters ourselves
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new UpstreamError(`${host(url)} took too long to send the book text`);
    }
    throw err;
  }
  if (!res.ok) throw new UpstreamError(`${host(url)} returned ${res.status} for the book text`, res.status);
  const text = await res.text();
  return {
    text: text.length > maxChars ? text.slice(0, maxChars) : text,
    contentType: res.headers.get("content-type") ?? "",
    truncated: text.length > maxChars,
  };
}

/** Collapse duplicate calls (e.g. getBook + getContent both needing the same metadata) for a short window. */
const memo = new Map<string, { at: number; promise: Promise<unknown> }>();

export function memoize<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const promise = fn().catch((err) => {
    memo.delete(key);
    throw err;
  });
  memo.set(key, { at: Date.now(), promise });
  if (memo.size > 300) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  return promise;
}

/** Strip Lucene/Solr syntax from user input so a stray ":" or quote can't break a search. */
export function plainTerms(query: string): string {
  return query
    .replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, " ")
    .replace(/\b(AND|OR|NOT)\b/g, (m) => m.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

export function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.find((x): x is string => typeof x === "string");
  return undefined;
}

export function toYear(v: unknown): number | undefined {
  const s = typeof v === "number" ? String(v) : firstString(v);
  const m = s?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return m ? Number(m[1]) : undefined;
}
