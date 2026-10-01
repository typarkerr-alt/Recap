import { NextRequest, NextResponse } from "next/server";
import { getAllSources } from "@/lib/sources";
import type { SearchResult } from "@/types";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  const sources = getAllSources().filter((s) => s.id !== "upload");

  const results = await Promise.allSettled(sources.map((s) => s.search(q, 10)));

  const combined: SearchResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      combined.push(...r.value);
    } else {
      console.warn(`Source ${sources[i].id} search failed:`, r.reason);
    }
  }

  return NextResponse.json({ results: combined });
}
