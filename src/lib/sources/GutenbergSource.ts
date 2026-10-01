import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { parseHtmlChapters, parsePlainTextChapters, createVirtualPages, countWords } from "../parsing/chapters";
import { sanitizeHtml } from "../sanitize";
import { getCachedContent, setCachedContent } from "../summarize/cache";

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
    year: undefined,
    description: (data.subjects as string[])?.slice(0, 3).join(", "),
    subjects: data.subjects,
    formats: data.formats,
    language: (data.languages as string[])?.[0],
  };
}

export class GutenbergSource implements BookSource {
  readonly id = "gutenberg" as const;
  readonly name = "Project Gutenberg";

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const url = `${GUTENDEX}?search=${encodeURIComponent(query)}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Gutenberg search failed: ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.results as any[]).slice(0, limit).map(mapBook);
  }

  async getBook(id: string): Promise<Book> {
    const res = await fetch(`${GUTENDEX}/${id}`, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`Gutenberg book ${id} not found`);
    return mapBook(await res.json());
  }

  async getContent(id: string): Promise<BookContent> {
    const cacheKey = `gutenberg:${id}`;
    const cached = getCachedContent(cacheKey);
    if (cached) return cached;

    const book = await this.getBook(id);
    const formats = (book.formats as Record<string, string>) ?? {};

    const contentUrl =
      formats["text/html"] ||
      formats["text/html; charset=utf-8"] ||
      formats["text/plain; charset=utf-8"] ||
      formats["text/plain; charset=us-ascii"] ||
      formats["text/plain"];

    if (!contentUrl) throw new Error("No downloadable content for this Gutenberg book");

    const res = await fetch(contentUrl);
    if (!res.ok) throw new Error("Failed to download book content");
    const text = await res.text();

    const isHtml = contentUrl.endsWith(".html") || text.trimStart().startsWith("<");
    // For HTML books: keep sanitized HTML for reader display, strip text for summarization
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

    setCachedContent(cacheKey, content);
    return content;
  }
}
