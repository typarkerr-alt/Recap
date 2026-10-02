import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSource } from "@/lib/sources";
import { summarizeText, summarizeBook, cachedTextStream, SSE_HEADERS } from "@/lib/summarize/summarize";
import {
  makeCacheKey,
  getCached,
  setCached,
  makeNotesKey,
  getCachedNotes,
  setCachedNotes,
} from "@/lib/summarize/cache";
import { checkRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/ip";
import { VALID_SOURCE_IDS } from "@/types";
import type { SummarizeRequest, SourceId, SummaryOptions } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Whole-book summaries of long novels take 1–3 minutes. 300s works on Hobby
// with Fluid compute (the default for new Vercel projects); without Fluid
// compute, Hobby is capped at 60s and long books will time out.
export const maxDuration = 300;

const VALID_SCOPES = ["page", "chapter", "book", "selection"];
const VALID_LENGTHS = ["tldr", "short", "detailed"];
const VALID_FORMATS = ["paragraph", "bullets", "takeaways"];

function validateRequest(body: unknown): { ok: true; data: SummarizeRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || !body) return { ok: false, error: "Invalid request body" };
  const b = body as Record<string, unknown>;

  if (!b.bookId || typeof b.bookId !== "string" || b.bookId.length > 200) return { ok: false, error: "Invalid bookId" };
  if (typeof b.sourceId !== "string" || !(VALID_SOURCE_IDS as readonly string[]).includes(b.sourceId))
    return { ok: false, error: "Invalid sourceId" };
  if (typeof b.scope !== "string" || !VALID_SCOPES.includes(b.scope)) return { ok: false, error: "Invalid scope" };

  const opts = b.options as Record<string, unknown> | undefined;
  if (!opts) return { ok: false, error: "Missing options" };
  if (!VALID_LENGTHS.includes(opts.length as string)) return { ok: false, error: "Invalid length" };
  if (!VALID_FORMATS.includes(opts.format as string)) return { ok: false, error: "Invalid format" };

  const chapterIndex =
    typeof b.chapterIndex === "number" && Number.isInteger(b.chapterIndex) && b.chapterIndex >= 0
      ? b.chapterIndex
      : undefined;
  const pageRange =
    Array.isArray(b.pageRange) && b.pageRange.length === 2 && b.pageRange.every((n) => Number.isInteger(n) && n > 0)
      ? (b.pageRange as [number, number])
      : undefined;

  return {
    ok: true,
    data: {
      bookId: b.bookId,
      sourceId: b.sourceId as SourceId,
      scope: b.scope as SummarizeRequest["scope"],
      chapterIndex,
      pageRange,
      text: typeof b.text === "string" ? b.text.slice(0, 50_000) : undefined,
      options: {
        length: opts.length as SummaryOptions["length"],
        format: opts.format as SummaryOptions["format"],
        spoilerFree: opts.spoilerFree === true,
      },
    },
  };
}

function sse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`summarize:${ip}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateRequest(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const { bookId, sourceId, scope, chapterIndex, pageRange, text, options } = validation.data;

  // Every distinct target needs its own cache key. Previously every *selection*
  // in a book shared one key, so highlighting new text returned the first summary.
  let target: string;
  if (scope === "selection") {
    if (!text?.trim()) return NextResponse.json({ error: "No text selected" }, { status: 400 });
    target = `sel-${createHash("sha256").update(text).digest("hex").slice(0, 24)}`;
  } else if (scope === "chapter") {
    if (chapterIndex === undefined) return NextResponse.json({ error: "Missing chapterIndex" }, { status: 400 });
    target = `ch-${chapterIndex}`;
  } else if (scope === "page") {
    if (!pageRange) return NextResponse.json({ error: "Missing pageRange" }, { status: 400 });
    target = `p-${pageRange[0]}-${pageRange[1]}`;
  } else {
    target = "book";
  }

  const cacheKey = makeCacheKey(bookId, sourceId, scope, options, target);
  const cached = await getCached(cacheKey);
  if (cached) return sse(cachedTextStream(cached));

  const onComplete = (full: string) => setCached(cacheKey, full);

  try {
    if (scope === "selection") {
      return sse(summarizeText(text!, "selection", options, { onComplete }));
    }

    const content = await getSource(sourceId).getContent(bookId);

    if (scope === "book") {
      const notesKey = makeNotesKey(sourceId, bookId);
      return sse(
        summarizeBook(content.chapters, options, {
          onComplete,
          notesCache: { get: () => getCachedNotes(notesKey), set: (n) => setCachedNotes(notesKey, n) },
        })
      );
    }

    if (scope === "chapter") {
      const chapter = content.chapters[chapterIndex!];
      if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
      return sse(summarizeText(chapter.content, "chapter", options, { onComplete, label: `titled "${chapter.title}"` }));
    }

    const pages = content.virtualPages.slice(pageRange![0] - 1, pageRange![1]);
    if (pages.length === 0) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    const pageText = pages.map((p) => p.content).join("\n\n");
    return sse(summarizeText(pageText, "page", options, { onComplete }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Summarization failed";
    console.error("[summarize]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
