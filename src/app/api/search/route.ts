import { NextRequest, NextResponse } from "next/server";
import { getSearchableSources, searchDpla, dplaEnabled } from "@/lib/sources";
import type { SearchResult } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(50, Math.max(5, Number(limitParam) || 10)) : 10;

  const providers: Array<{ name: string; run: () => Promise<SearchResult[]> }> = [
    ...getSearchableSources().map((s) => ({ name: s.id, run: () => s.search(q, limit) })),
    ...(dplaEnabled() ? [{ name: "dpla", run: () => searchDpla(q, limit) }] : []),
  ];

  const settled = await Promise.allSettled(providers.map((p) => p.run()));
  const lists = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[search] ${providers[i].name} failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
    return [];
  });

  // Interleave so every library's best matches show up near the top, then de-dupe
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const r = list[i];
      if (!r) continue;
      const key = `${r.sourceId}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(r);
    }
  }

  return NextResponse.json(
    { results },
    // Let Vercel's CDN answer repeat searches — also keeps us far from LOC's rate limit
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
  );
}
