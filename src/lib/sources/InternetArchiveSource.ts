import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { parsePlainTextChapters, createVirtualPages, countWords, cleanOcrText, stripHtml } from "../parsing/chapters";
import { getCachedContent, setCachedContent } from "../summarize/cache";
import { fetchJson, fetchText, memoize, plainTerms, firstString, toYear, UpstreamError } from "../http";

// Internet Archive: millions of scanned books. Only items that are free to read
// without an account are used — lending-library items (borrow-only) are filtered out.
const IA = "https://archive.org";

const FREE_TEXTS =
  "mediatype:texts AND NOT access-restricted-item:true AND NOT collection:inlibrary AND NOT collection:printdisabled";

const ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export const LENDING_ONLY_MESSAGE =
  "This Internet Archive book is lending-only (you need an account to borrow it), so it can't be read or summarized here.";

interface IaFile {
  name: string;
  format?: string;
}

interface IaMetadata {
  metadata?: Record<string, unknown>;
  files?: IaFile[];
  is_dark?: boolean;
}

function getMeta(id: string): Promise<IaMetadata> {
  if (!ID_PATTERN.test(id)) return Promise.reject(new UpstreamError(`Invalid Internet Archive id "${id}"`, 404));
  return memoize(`ia-meta:${id}`, 60_000, () =>
    fetchJson<IaMetadata>(`${IA}/metadata/${id}`, { next: { revalidate: 86400 } })
  );
}

function isRestricted(meta: IaMetadata): boolean {
  const m = meta.metadata ?? {};
  const flag = String(m["access-restricted-item"] ?? "").toLowerCase();
  const collections = ([] as unknown[]).concat(m.collection ?? []).map(String);
  return (
    meta.is_dark === true ||
    flag === "true" ||
    collections.some((c) => c === "inlibrary" || c === "printdisabled" || c === "lendinglibrary")
  );
}

function pickTextFile(files: IaFile[]): IaFile | undefined {
  return (
    files.find((f) => f.format === "DjVuTXT") ??
    files.find((f) => f.name.endsWith("_djvu.txt")) ??
    files.find((f) => f.format === "Text" && f.name.endsWith(".txt")) ??
    files.find((f) => f.name.endsWith(".txt") && !f.name.includes("_meta"))
  );
}

function joinNames(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  return typeof v === "string" ? v : "Unknown";
}

export class InternetArchiveSource implements BookSource {
  readonly id = "archive" as const;
  readonly name = "Internet Archive";

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const terms = plainTerms(query);
    if (!terms) return [];
    const params = new URLSearchParams({
      q: `(title:(${terms}) OR creator:(${terms})) AND ${FREE_TEXTS}`,
      rows: String(limit),
      page: "1",
      output: "json",
    });
    for (const f of ["identifier", "title", "creator", "year", "date", "description", "language"]) params.append("fl[]", f);
    params.append("sort[]", "downloads desc"); // most-read editions first

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchJson<any>(`${IA}/advancedsearch.php?${params}`, { next: { revalidate: 3600 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs: any[] = data?.response?.docs ?? [];

    return docs.map((d) => ({
      id: String(d.identifier),
      sourceId: "archive" as const,
      title: firstString(d.title) ?? "Untitled",
      author: joinNames(d.creator),
      coverUrl: `${IA}/services/img/${d.identifier}`,
      year: toYear(d.year ?? d.date),
      description: stripHtml(firstString(d.description) ?? "").slice(0, 300),
      language: firstString(d.language),
    }));
  }

  async getBook(id: string): Promise<Book> {
    const meta = await getMeta(id);
    const m = meta.metadata;
    if (!m) throw new UpstreamError(`Internet Archive item ${id} not found`, 404);
    return {
      id,
      sourceId: "archive",
      title: firstString(m.title) ?? id,
      author: joinNames(m.creator),
      coverUrl: `${IA}/services/img/${id}`,
      year: toYear(m.date ?? m.year),
      description: stripHtml(firstString(m.description) ?? "").slice(0, 1000),
      language: firstString(m.language),
      subjects: ([] as unknown[]).concat(m.subject ?? []).map(String).slice(0, 10),
      sourceUrl: `${IA}/details/${id}`,
    };
  }

  async getContent(id: string): Promise<BookContent> {
    const cacheKey = `archive:${id}`;
    const cached = await getCachedContent(cacheKey);
    if (cached) return cached;

    const meta = await getMeta(id);
    if (!meta.metadata) throw new UpstreamError(`Internet Archive item ${id} not found`, 404);
    if (isRestricted(meta)) throw new Error(LENDING_ONLY_MESSAGE);

    const file = pickTextFile(meta.files ?? []);
    if (!file) throw new Error("This Internet Archive item has no readable text (it may be images only).");

    let text: string;
    try {
      ({ text } = await fetchText(`${IA}/download/${id}/${encodeURIComponent(file.name)}`));
    } catch (err) {
      if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw new Error(LENDING_ONLY_MESSAGE);
      throw err;
    }
    if (text.trim().length < 200) throw new Error("This Internet Archive item has almost no readable text.");

    const chapters = parsePlainTextChapters(cleanOcrText(text), id);
    const content: BookContent = {
      bookId: id,
      sourceId: "archive",
      chapters,
      virtualPages: createVirtualPages(chapters),
      totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
    };
    await setCachedContent(cacheKey, content);
    return content;
  }
}
