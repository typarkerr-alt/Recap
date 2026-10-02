import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { parsePlainTextChapters, createVirtualPages, countWords, cleanOcrText, stripHtml } from "../parsing/chapters";
import { getCachedContent, setCachedContent } from "../summarize/cache";
import { checkRateLimit } from "../ratelimit";
import { fetchJson, fetchText, memoize, firstString, toYear, UpstreamError } from "../http";

// Library of Congress "Selected Digitized Books": 150,000+ books from the Library's
// general collections that are openly available — public domain, free to read, no key.
const LOC = "https://www.loc.gov";
const COLLECTION = `${LOC}/collections/selected-digitized-books/`;
const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

/*
 * The loc.gov JSON API allows ~20 requests/minute and blocks the caller's IP for an
 * HOUR if that's exceeded. On Vercel that IP is shared, so we stay well under it:
 * a per-instance budget of 10/min, Next's data cache for repeat lookups, and a
 * cool-down whenever LOC pushes back (429 or a CAPTCHA page).
 */
const g = globalThis as unknown as { __recapLocBlockedUntil?: number };
const BUSY = "The Library of Congress is limiting requests right now. Try again in a few minutes, or pick another source.";

function guard() {
  if ((g.__recapLocBlockedUntil ?? 0) > Date.now()) throw new UpstreamError(BUSY, 429);
  if (!checkRateLimit("loc-api").allowed) throw new UpstreamError(BUSY, 429);
}

async function locJson<T>(url: string, revalidate: number): Promise<T> {
  guard();
  try {
    return await fetchJson<T>(url, { next: { revalidate } }, 20_000);
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 429 || err.status === 503)) {
      g.__recapLocBlockedUntil = Date.now() + 10 * 60_000;
      throw new UpstreamError(BUSY, 429);
    }
    throw err;
  }
}

function idFromUrl(url: unknown): string | undefined {
  const m = typeof url === "string" ? url.match(/\/item\/([^/?#]+)\/?/) : null;
  return m?.[1];
}

function imageUrl(v: unknown): string | undefined {
  const raw = firstString(v);
  if (!raw) return undefined;
  const clean = raw.split("#")[0];
  return clean.startsWith("//") ? `https:${clean}` : clean;
}

function names(v: unknown): string {
  const arr = ([] as unknown[]).concat(v ?? []).map((x) => (typeof x === "string" ? x : Object.keys(x as object)[0]));
  return arr.filter(Boolean).join("; ") || "Unknown";
}

/** OCR files are sometimes DjVu/ALTO XML rather than plain text. */
function xmlToText(xml: string): string {
  return xml
    .replace(/<\/(LINE|TextLine)>/gi, "\n")
    .replace(/<\/(PARAGRAPH|TextBlock|PAGE|OBJECT)>/gi, "\n\n")
    .replace(/<String[^>]*CONTENT="([^"]*)"[^>]*\/?>/gi, "$1 ") // ALTO words
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n");
}

interface LocItemResponse {
  item?: Record<string, unknown>;
  resources?: Array<Record<string, unknown>>;
}

function getItem(id: string): Promise<LocItemResponse> {
  if (!ID_PATTERN.test(id)) return Promise.reject(new UpstreamError(`Invalid Library of Congress id "${id}"`, 404));
  // getBook + getContent both need this — one request, not two
  return memoize(`loc-item:${id}`, 120_000, () =>
    locJson<LocItemResponse>(`${LOC}/item/${id}/?fo=json&at=item,resources`, 86400)
  );
}

export class LibraryOfCongressSource implements BookSource {
  readonly id = "loc" as const;
  readonly name = "Library of Congress";

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    if (query.trim().length < 3) return []; // save the tiny request budget for real queries
    const params = new URLSearchParams({
      q: query,
      fa: "access-restricted:false",
      fo: "json",
      c: String(Math.min(limit, 50)),
      at: "results",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await locJson<any>(`${COLLECTION}?${params}`, 3600);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = data?.results ?? [];

    return results
      .filter((r) => r.access_restricted !== true)
      .map((r) => {
        const id = idFromUrl(r.url) ?? idFromUrl(r.id);
        if (!id) return null;
        return {
          id,
          sourceId: "loc" as const,
          title: firstString(r.title) ?? "Untitled",
          author: names(r.contributor),
          coverUrl: imageUrl(r.image_url),
          year: toYear(r.date),
          description: stripHtml(firstString(r.description) ?? "").slice(0, 300),
          language: firstString(r.language),
        } satisfies SearchResult;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, limit);
  }

  async getBook(id: string): Promise<Book> {
    const { item } = await getItem(id);
    if (!item) throw new UpstreamError(`Library of Congress item ${id} not found`, 404);
    return {
      id,
      sourceId: "loc",
      title: firstString(item.title) ?? id,
      author: names(item.contributor_names ?? item.contributors),
      coverUrl: imageUrl(item.image_url),
      year: toYear(item.date),
      description: stripHtml(firstString(item.summary) ?? firstString(item.description) ?? "").slice(0, 1000),
      language: firstString(item.language),
      sourceUrl: `${LOC}/item/${id}/`,
    };
  }

  async getContent(id: string): Promise<BookContent> {
    const cacheKey = `loc:${id}`;
    const cached = await getCachedContent(cacheKey);
    if (cached) return cached;

    const { item, resources } = await getItem(id);
    if (!item) throw new UpstreamError(`Library of Congress item ${id} not found`, 404);
    if (item.access_restricted === true) {
      throw new Error("This Library of Congress item can only be viewed on-site, so it can't be read here.");
    }

    // Multi-volume works have several resources; read up to 3 volumes in order
    const textUrls = (resources ?? [])
      .map((r) => firstString(r.djvu_text_file) ?? firstString(r.fulltext_file) ?? firstString(r.fulltext_derivative))
      .filter((u): u is string => !!u)
      .map((u) => (u.startsWith("//") ? `https:${u}` : u))
      .slice(0, 3);

    if (textUrls.length === 0) {
      throw new Error("The Library of Congress has page images for this book but no machine-readable text.");
    }

    const volumes: string[] = [];
    for (const url of textUrls) {
      const { text, contentType } = await fetchText(url, 30_000, 4_000_000);
      const isXml = contentType.includes("xml") || url.endsWith(".xml") || text.trimStart().startsWith("<");
      volumes.push(cleanOcrText(isXml ? xmlToText(text) : text));
    }
    const fullText = volumes.length > 1 ? volumes.map((v, i) => `VOLUME ${i + 1}\n\n${v}`).join("\n\n") : volumes[0];
    if (fullText.trim().length < 200) throw new Error("This Library of Congress book has almost no readable text.");

    const chapters = parsePlainTextChapters(fullText, id);
    const content: BookContent = {
      bookId: id,
      sourceId: "loc",
      chapters,
      virtualPages: createVirtualPages(chapters),
      totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
    };
    await setCachedContent(cacheKey, content);
    return content;
  }
}
