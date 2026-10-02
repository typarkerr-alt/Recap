import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { parseHtmlChapters, parsePlainTextChapters, createVirtualPages, countWords } from "../parsing/chapters";
import { sanitizeHtml } from "../sanitize";
import { getCachedContent, setCachedContent } from "../summarize/cache";
import { fetchJson, fetchText, UpstreamError } from "../http";

// Project Gutenberg: 75,000+ public-domain books, proofread by volunteers — the cleanest text of any source.
const GUTENDEX = "https://gutendex.com/books";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBook(data: any): Book {
  const author = (data.authors as Array<{ name: string }>)?.map((a) => a.name).join(", ") || "Unknown";
  return {
    id: String(data.id),
    sourceId: "gutenberg",
    title: data.title,
    author,
    coverUrl: data.formats?.["image/jpeg"],
    description: (data.subjects as string[])?.slice(0, 3).join(", "),
    subjects: data.subjects,
    formats: data.formats,
    language: (data.languages as string[])?.[0],
    sourceUrl: `https://www.gutenberg.org/ebooks/${data.id}`,
  };
}

export class GutenbergSource implements BookSource {
  readonly id = "gutenberg" as const;
  readonly name = "Project Gutenberg";

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchJson<any>(`${GUTENDEX}?search=${encodeURIComponent(query)}`, { next: { revalidate: 3600 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data.results ?? []) as any[]).slice(0, limit).map(mapBook);
  }

  async getBook(id: string): Promise<Book> {
    if (!/^\d+$/.test(id)) throw new UpstreamError(`Invalid Gutenberg id "${id}"`, 404);
    return mapBook(await fetchJson(`${GUTENDEX}/${id}`, { next: { revalidate: 86400 } }));
  }

  async getContent(id: string): Promise<BookContent> {
    const cacheKey = `gutenberg:${id}`;
    const cached = await getCachedContent(cacheKey);
    if (cached) return cached;

    const book = await this.getBook(id);
    const formats = (book.formats as Record<string, string>) ?? {};

    const contentUrl =
      formats["text/html"] ||
      formats["text/html; charset=utf-8"] ||
      formats["text/plain; charset=utf-8"] ||
      formats["text/plain; charset=us-ascii"] ||
      formats["text/plain"];

    if (!contentUrl) throw new Error("No downloadable text for this Gutenberg book");

    const { text } = await fetchText(contentUrl);
    const isHtml = contentUrl.endsWith(".html") || text.trimStart().startsWith("<");
    const chapters = isHtml
      ? parseHtmlChapters(sanitizeHtml(text), id, { keepHtml: true })
      : parsePlainTextChapters(text, id);

    const content: BookContent = {
      bookId: id,
      sourceId: "gutenberg",
      chapters,
      virtualPages: createVirtualPages(chapters),
      totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
    };

    await setCachedContent(cacheKey, content);
    return content;
  }
}
