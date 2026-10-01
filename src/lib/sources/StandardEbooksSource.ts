import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { XMLParser } from "fast-xml-parser";
import { parseEpub } from "../parsing/epub";
import { getCachedContent, setCachedContent } from "../summarize/cache";

const SE_OPDS = "https://standardebooks.org/feeds/opds";

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: () => false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEntry(entry: any): SearchResult | null {
  try {
    const id = entry.id ?? "";
    const slug = String(id).replace("https://standardebooks.org/ebooks/", "").replace(/\//g, "--");
    const link = entry.link;
    const links = Array.isArray(link) ? link : link ? [link] : [];
    const coverLink = links.find((l: Record<string, string>) => l["@_type"]?.includes("image"));

    return {
      id: slug,
      sourceId: "standardebooks",
      title: entry.title ?? "Unknown",
      author: entry.author?.name ?? (Array.isArray(entry.author) ? entry.author.map((a: {name: string}) => a.name).join(", ") : "Unknown"),
      coverUrl: coverLink?.["@_href"],
      year: entry.updated ? new Date(entry.updated).getFullYear() : undefined,
      description: entry.summary ?? entry.content?.["#text"] ?? "",
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
    const slug = id.replace(/--/g, "/");
    const res = await fetch(`https://standardebooks.org/feeds/opds/all`, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error("Could not fetch Standard Ebooks catalog");
    const xml = await res.text();
    const feed = xmlParser.parse(xml);
    const entries = feed?.feed?.entry;
    const arr = Array.isArray(entries) ? entries : [entries];
    const entry = arr.find((e: Record<string, string>) => e?.id?.includes(slug));
    if (!entry) throw new Error(`Standard Ebook ${id} not found`);
    return {
      ...mapEntry(entry)!,
      id,
    };
  }

  async getContent(id: string): Promise<BookContent> {
    const cacheKey = `standardebooks:${id}`;
    const cached = getCachedContent(cacheKey);
    if (cached) return cached;

    // Download the EPUB
    const slug = id.replace(/--/g, "/");
    const epubUrl = `https://standardebooks.org/ebooks/${slug}/${slug.split("/").pop()}.epub`;
    const res = await fetch(epubUrl);
    if (!res.ok) throw new Error(`Could not download Standard Ebook EPUB: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const content = await parseEpub(buffer, id);
    content.sourceId = "standardebooks";

    setCachedContent(cacheKey, content);
    return content;
  }
}
