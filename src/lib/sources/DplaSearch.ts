import type { SearchResult, SourceId } from "@/types";
import { fetchJson, firstString, toYear } from "../http";

// DPLA (Digital Public Library of America) is a catalog: it indexes 50M+ items
// from US libraries but doesn't host the books itself. We use it to *find* books,
// then keep only results whose text lives somewhere we can read for free
// (Internet Archive, Project Gutenberg, Library of Congress) and hand them to
// that source. Requires a free key: curl -X POST https://api.dp.la/v2/api_key/you@example.com

function readableTarget(url: unknown): { sourceId: SourceId; id: string } | null {
  if (typeof url !== "string") return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  let m: RegExpMatchArray | null;
  if (host === "archive.org" && (m = u.pathname.match(/^\/details\/([A-Za-z0-9._-]+)/))) return { sourceId: "archive", id: m[1] };
  if (host === "gutenberg.org" && (m = u.pathname.match(/^\/ebooks\/(\d+)/))) return { sourceId: "gutenberg", id: m[1] };
  if (host === "loc.gov" && (m = u.pathname.match(/^\/item\/([A-Za-z0-9._-]+)/))) return { sourceId: "loc", id: m[1] };
  return null; // e.g. HathiTrust: free to view on their site, but no open full-text API
}

function joined(v: unknown): string {
  return ([] as unknown[]).concat(v ?? []).filter((x): x is string => typeof x === "string").join(", ") || "Unknown";
}

export function dplaEnabled(): boolean {
  return !!process.env.DPLA_API_KEY;
}

export async function searchDpla(query: string, limit = 20): Promise<SearchResult[]> {
  const key = process.env.DPLA_API_KEY?.trim();
  if (!key) return [];

  const params = new URLSearchParams({
    q: query,
    "sourceResource.type": "text",
    page_size: String(Math.min(limit * 4, 100)), // many hits point at sites we can't read; over-fetch
    api_key: key,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fetchJson<any>(`https://api.dp.la/v2/items?${params}`, { next: { revalidate: 3600 } });

  const out: SearchResult[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const doc of (data.docs ?? []) as any[]) {
    const target = readableTarget(doc.isShownAt);
    if (!target) continue;
    const sr = doc.sourceResource ?? {};
    const date = Array.isArray(sr.date) ? sr.date[0] : sr.date;
    out.push({
      ...target,
      title: firstString(sr.title) ?? "Untitled",
      author: joined(sr.creator),
      coverUrl: typeof doc.object === "string" ? doc.object : undefined,
      year: toYear(date?.displayDate ?? date?.begin),
      description: firstString(sr.description)?.slice(0, 300),
      language: firstString(sr.language?.[0]?.name),
    });
    if (out.length >= limit) break;
  }
  return out;
}
