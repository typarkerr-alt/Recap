import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { getCachedContent, setCachedContent } from "../summarize/cache";
import { fetchJson, plainTerms, UpstreamError } from "../http";
import { GutenbergSource } from "./GutenbergSource";
import { InternetArchiveSource, LENDING_ONLY_MESSAGE } from "./InternetArchiveSource";

// Open Library: only books marked `ebook_access:public` — readable by anyone,
// no account, no borrowing. (The old version also listed borrow-only books,
// which then failed when you tried to read them.)
//
// IDs look like "OL45804W~pg-2701" or "OL45804W~ia-mobydick00melv": the work,
// plus where its free text lives, so we never have to guess an edition later.
const OL = "https://openlibrary.org";

interface OlEdition {
  ia?: string[];
  ebook_access?: string;
}

interface OlDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  subject?: string[];
  language?: string[];
  id_project_gutenberg?: string[];
  editions?: { docs?: OlEdition[] };
}

function contentRef(doc: OlDoc): string | undefined {
  const pg = doc.id_project_gutenberg?.find((x) => /^\d+$/.test(x));
  if (pg) return `pg-${pg}`; // Gutenberg text is proofread — better than OCR
  const editions = doc.editions?.docs ?? [];
  const edition = editions.find((e) => e.ebook_access === "public" && e.ia?.length) ?? editions.find((e) => e.ia?.length);
  const ia = edition?.ia?.[0];
  return ia ? `ia-${ia}` : undefined;
}

function parseId(id: string): { workId: string; ref?: string } {
  const [workId, ref] = id.split("~");
  if (!/^OL\d+W$/.test(workId)) throw new UpstreamError(`Invalid Open Library id "${id}"`, 404);
  return { workId, ref };
}

export class OpenLibrarySource implements BookSource {
  readonly id = "openlibrary" as const;
  readonly name = "Open Library";

  private gutenberg = new GutenbergSource();
  private archive = new InternetArchiveSource();

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const terms = plainTerms(query);
    if (!terms) return [];
    const params = new URLSearchParams({
      q: `(${terms}) AND ebook_access:public`,
      limit: String(limit),
      fields: [
        "key",
        "title",
        "author_name",
        "cover_i",
        "first_publish_year",
        "subject",
        "language",
        "id_project_gutenberg",
        "editions",
        "editions.key",
        "editions.ia",
        "editions.ebook_access",
      ].join(","),
    });
    const data = await fetchJson<{ docs?: OlDoc[] }>(`${OL}/search.json?${params}`, { next: { revalidate: 3600 } });

    const results: SearchResult[] = [];
    for (const doc of data.docs ?? []) {
      const workId = doc.key?.replace("/works/", "");
      const ref = contentRef(doc);
      if (!workId || !ref) continue; // no free text anywhere — skip rather than show a dead end
      results.push({
        id: `${workId}~${ref}`,
        sourceId: "openlibrary",
        title: doc.title ?? "Unknown",
        author: doc.author_name?.[0] ?? "Unknown",
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
        year: doc.first_publish_year,
        description: doc.subject?.slice(0, 3).join(", "),
        language: doc.language?.[0],
      });
    }
    return results.slice(0, limit);
  }

  async getBook(id: string): Promise<Book> {
    const { workId } = parseId(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchJson<any>(`${OL}/works/${workId}.json`, { next: { revalidate: 86400 } });

    const authorKey = (data.authors as Array<{ author?: { key?: string } }>)?.[0]?.author?.key;
    let author = "Unknown";
    if (authorKey) {
      try {
        const a = await fetchJson<{ name?: string }>(`${OL}${authorKey}.json`, { next: { revalidate: 86400 } });
        author = a.name ?? author;
      } catch {}
    }

    const coverId = (data.covers as number[])?.find((c) => c > 0);
    return {
      id,
      sourceId: "openlibrary",
      title: data.title ?? "Unknown",
      author,
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
      description: typeof data.description === "string" ? data.description : data.description?.value,
      subjects: data.subjects,
      sourceUrl: `${OL}/works/${workId}`,
    };
  }

  async getContent(id: string): Promise<BookContent> {
    const { workId, ref } = parseId(id);
    const cacheKey = `openlibrary:${id}`;
    const cached = await getCachedContent(cacheKey);
    if (cached) return cached;

    let inner: BookContent;
    if (ref?.startsWith("pg-")) {
      inner = await this.gutenberg.getContent(ref.slice(3));
    } else if (ref?.startsWith("ia-")) {
      inner = await this.archive.getContent(ref.slice(3));
    } else {
      inner = await this.legacyLookup(workId); // links saved before this change
    }

    const content: BookContent = { ...inner, bookId: id, sourceId: "openlibrary" };
    await setCachedContent(cacheKey, content);
    return content;
  }

  /** Old-style ids ("OL45804W") — find a free edition the slow way. */
  private async legacyLookup(workId: string): Promise<BookContent> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eds = await fetchJson<any>(`${OL}/works/${workId}/editions.json?limit=50`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = eds.entries ?? [];

    const pg = entries.flatMap((e) => e.identifiers?.project_gutenberg ?? e.identifiers?.gutenberg ?? [])[0];
    if (pg) return this.gutenberg.getContent(String(pg));

    for (const ocaid of entries.map((e) => e.ocaid).filter(Boolean).slice(0, 5)) {
      try {
        return await this.archive.getContent(String(ocaid));
      } catch (err) {
        if (err instanceof Error && err.message === LENDING_ONLY_MESSAGE) continue; // try the next edition
        throw err;
      }
    }
    throw new Error("No free-to-read edition of this book was found. It may only be available to borrow.");
  }
}
