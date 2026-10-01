import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { XMLParser } from "fast-xml-parser";
import { parseEpub } from "../parsing/epub";
import { getCachedContent, setCachedContent } from "../summarize/cache";

const SE_BASE = "https://standardebooks.org";
const SE_OPDS = `${SE_BASE}/feeds/opds`;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: () => false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEpubUrl(links: any[]): string | undefined {
  // Find the acquisition link for epub+zip
  const link = links.find(
    (l) =>
      (l["@_type"]?.includes("epub") || l["@_rel"]?.includes("acquisition")) &&
      l["@_href"]
  );
  if (!link) return undefined;
  const href = link["@_href"] as string;
  return href.startsWith("http") ? href : `${SE_BASE}${href}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEntry(entry: any): (SearchResult & { epubUrl?: string }) | null {
  try {
    const id = entry.id ?? "";
    const slug = String(id).replace(`${SE_BASE}/ebooks/`, "").replace(/\//g, "--");
    const link = entry.link;
    const links = Array.isArray(link) ? link : link ? [link] : [];
    const coverLink = links.find((l: Record<string, string>) => l["@_type"]?.includes("image"));
    const epubUrl = extractEpubUrl(links);

    return {
      id: slug,
      sourceId: "standardebooks",
      title: entry.title ?? "Unknown",
      author:
        entry.author?.name ??
        (Array.isArray(entry.author) ? entry.author.map((a: { name: string }) => a.name).join(", ") : "Unknown"),
      coverUrl: coverLink?.["@_href"]
        ? coverLink["@_href"].startsWith("http")
          ? coverLink["@_href"]
          : `${SE_BASE}${coverLink["@_href"]}`
        : undefined,
      year: entry.updated ? new Date(entry.updated as string).getFullYear() : undefined,
      description: entry.summary ?? (entry.content as { "#text": string } | undefined)?.["#text"] ?? "",
      epubUrl,
    };
  } catch {
    return null;
  }
}

export class StandardEbooksSource implements BookSource {
  readonly id = "standardebooks" as const;
  readonly name = "Standard Ebooks";

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const url = `${SE_OPDS}?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Standard Ebooks search failed: ${res.status}`);
    const xml = await res.text();
    const feed = xmlParser.parse(xml);
    const entries = feed?.feed?.entry;
    if (!entries) return [];
    const arr = Array.isArray(entries) ? entries : [entries];
    return arr
      .map(mapEntry)
      .filter((e): e is SearchResult => e !== null)
      .slice(0, limit);
  }

  async getBook(id: string): Promise<Book> {
    // Search the catalog to find this specific entry (needed to get the epub link)
    const slug = id.replace(/--/g, "/");
    const res = await fetch(`${SE_OPDS}/all`, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error("Could not fetch Standard Ebooks catalog");
    const xml = await res.text();
    const feed = xmlParser.parse(xml);
    const entries = feed?.feed?.entry;
    const arr = Array.isArray(entries) ? entries : [entries];
    const entry = arr.find((e: Record<string, string>) => e?.id?.includes(slug));
    if (!entry) throw new Error(`Standard Ebook ${id} not found`);
    const mapped = mapEntry(entry);
    if (!mapped) throw new Error(`Could not parse Standard Ebook ${id}`);
    return {
      ...mapped,
      id,
      formats: mapped.epubUrl ? { "application/epub+zip": mapped.epubUrl } : {},
    };
  }

  async getContent(id: string): Promise<BookContent> {
    const cacheKey = `standardebooks:${id}`;
    const cached = getCachedContent(cacheKey);
    if (cached) return cached;

    // Get the book to obtain the real epub URL from OPDS entry
    const book = await this.getBook(id);
    const epubUrl = book.formats?.["application/epub+zip"] ?? this.guessEpubUrl(id);

    const res = await fetch(epubUrl);
    if (!res.ok) throw new Error(`Could not download Standard Ebook EPUB: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const content = await parseEpub(buffer, id);
    content.sourceId = "standardebooks";

    setCachedContent(cacheKey, content);
    return content;
  }

  // Last-resort heuristic — used only if the OPDS entry lacks an acquisition link
  private guessEpubUrl(id: string): string {
    const slug = id.replace(/--/g, "/");
    const last = slug.split("/").pop() ?? slug;
    return `${SE_BASE}/ebooks/${slug}/downloads/${last}.epub`;
  }
}
