import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { parsePlainTextChapters, createVirtualPages, countWords } from "../parsing/chapters";
import { getCachedContent, setCachedContent } from "../summarize/cache";
import { GutenbergSource } from "./GutenbergSource";

const OL_BASE = "https://openlibrary.org";
const IA_BASE = "https://archive.org";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any): SearchResult {
  return {
    id: (doc.key as string)?.replace("/works/", "") ?? doc.key,
    sourceId: "openlibrary",
    title: doc.title ?? "Unknown",
    author: (doc.author_name as string[])?.[0] ?? "Unknown",
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
    year: doc.first_publish_year,
    description: (doc.subject as string[])?.slice(0, 3).join(", "),
    language: (doc.language as string[])?.[0],
  };
}

async function findIaTextUrl(iaId: string): Promise<string> {
  // Use the IA metadata API to find the actual text file rather than guessing the URL
  const metaRes = await fetch(`${IA_BASE}/metadata/${iaId}`);
  if (metaRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = await metaRes.json();
    const files = (meta?.files as Array<{ name: string; format: string }>) ?? [];

    const textFile =
      files.find((f) => f.format === "DjVuTXT") ??
      files.find((f) => f.name?.endsWith("_djvu.txt")) ??
      files.find((f) => f.format === "Plain Text" && f.name?.endsWith(".txt")) ??
      files.find((f) => f.format === "Abbyy GZ") ??
      files.find((f) => f.name?.endsWith(".txt"));

    if (textFile) {
      return `${IA_BASE}/download/${iaId}/${textFile.name}`;
    }
  }

  // Fallback: try the common _djvu.txt pattern
  return `${IA_BASE}/stream/${iaId}/${iaId}_djvu.txt`;
}

export class OpenLibrarySource implements BookSource {
  readonly id = "openlibrary" as const;
  readonly name = "Open Library";

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const url = `${OL_BASE}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=key,title,author_name,cover_i,first_publish_year,subject,language,ia,public_scan_b`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Open Library search failed: ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.docs as any[])
      .filter((d) => d.ia && d.public_scan_b)
      .slice(0, limit)
      .map(mapDoc);
  }

  async getBook(id: string): Promise<Book> {
    const res = await fetch(`${OL_BASE}/works/${id}.json`, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`Open Library work ${id} not found`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    // Resolve the first author reference to a human-readable name
    const authorKey = (data.authors as Array<{ author: { key: string } }>)?.[0]?.author?.key?.replace("/authors/", "");
    let author = "Unknown";
    if (authorKey) {
      try {
        const authorRes = await fetch(`${OL_BASE}/authors/${authorKey}.json`, { next: { revalidate: 86400 } });
        if (authorRes.ok) {
          const authorData = await authorRes.json() as { name?: string };
          author = authorData.name ?? "Unknown";
        }
      } catch {}
    }

    const coverId = (data.covers as number[])?.[0];
    return {
      id,
      sourceId: "openlibrary",
      title: data.title,
      author,
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
      description:
        typeof data.description === "string"
          ? data.description
          : (data.description as { value: string })?.value,
      subjects: data.subjects,
    };
  }

  async getContent(id: string): Promise<BookContent> {
    const cacheKey = `openlibrary:${id}`;
    const cached = getCachedContent(cacheKey);
    if (cached) return cached;

    // Fetch editions to look for both a Gutenberg ID and an IA identifier
    const edRes = await fetch(`${OL_BASE}/works/${id}/editions.json?limit=20`);
    if (!edRes.ok) throw new Error("Could not fetch editions");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editions: any = await edRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = editions.entries ?? [];

    // Prefer Gutenberg: it's publicly downloadable without IA auth restrictions
    const gutenbergId = entries
      .flatMap((e) => (e.identifiers?.gutenberg as string[] | undefined) ?? [])
      .find((gid) => typeof gid === "string" && gid.length > 0);

    if (gutenbergId) {
      const gutenberg = new GutenbergSource();
      const gutenbergContent = await gutenberg.getContent(gutenbergId);
      // Remap IDs so this caches under the OL key and routes correctly
      const content: BookContent = { ...gutenbergContent, bookId: id, sourceId: "openlibrary" };
      setCachedContent(cacheKey, content);
      return content;
    }

    // Fall back to Internet Archive text download
    const iaId = entries
      .map((e) => e.ocaid as string | undefined)
      .find((ocaid) => typeof ocaid === "string" && ocaid.length > 0);

    if (!iaId) throw new Error("No freely readable full text found for this book.");

    const textUrl = await findIaTextUrl(iaId);
    // Use a browser-like User-Agent — IA blocks plain server requests on some items
    const txtRes = await fetch(textUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Recap/1.0; +https://recap.vercel.app)" },
    });
    if (!txtRes.ok) {
      throw new Error(
        txtRes.status === 401 || txtRes.status === 403
          ? "This book requires an Internet Archive account to access. Try searching on Project Gutenberg instead."
          : `Could not download full text (${txtRes.status})`
      );
    }
    const text = await txtRes.text();

    const chapters = parsePlainTextChapters(text, id);
    const content: BookContent = {
      bookId: id,
      sourceId: "openlibrary",
      chapters,
      virtualPages: createVirtualPages(chapters),
      totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
    };

    setCachedContent(cacheKey, content);
    return content;
  }
}
