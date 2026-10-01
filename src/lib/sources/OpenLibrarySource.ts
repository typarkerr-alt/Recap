import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { parsePlainTextChapters, createVirtualPages, countWords } from "../parsing/chapters";
import { getCachedContent, setCachedContent } from "../summarize/cache";

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

    const coverId = (data.covers as number[])?.[0];
    return {
      id,
      sourceId: "openlibrary",
      title: data.title,
      author: "Unknown",
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

    // Find the Internet Archive identifier via the editions endpoint
    const edRes = await fetch(`${OL_BASE}/works/${id}/editions.json?limit=10`);
    if (!edRes.ok) throw new Error("Could not fetch editions");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editions: any = await edRes.json();

    // Pick the first edition that has an ocaid (Internet Archive ID)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iaId = (editions.entries as any[])?.map((e) => e.ocaid).find((id) => typeof id === "string" && id.length > 0);

    if (!iaId) throw new Error("No freely readable full text found on Internet Archive");

    // Use the IA metadata API to find the right text file
    const textUrl = await findIaTextUrl(iaId);
    const txtRes = await fetch(textUrl);
    if (!txtRes.ok) throw new Error(`Could not download full text from Internet Archive (${txtRes.status})`);
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
