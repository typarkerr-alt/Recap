import { NextRequest, NextResponse } from "next/server";
import { getSource } from "@/lib/sources";
import { summarizeText, summarizeBook } from "@/lib/summarize/summarize";
import { makeCacheKey, getCached, setCached } from "@/lib/summarize/cache";
import { checkRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/ip";
import type { SummarizeRequest, SourceId, SummaryOptions } from "@/types";

const VALID_SCOPES = ["page", "chapter", "book", "selection"];
const VALID_LENGTHS = ["tldr", "short", "detailed"];
const VALID_FORMATS = ["paragraph", "bullets", "takeaways"];

function validateRequest(body: unknown): { ok: true; data: SummarizeRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || !body) return { ok: false, error: "Invalid request body" };
  const b = body as Record<string, unknown>;

  if (!b.bookId || typeof b.bookId !== "string" || b.bookId.length > 200)
    return { ok: false, error: "Invalid bookId" };
  if (!b.sourceId || typeof b.sourceId !== "string") return { ok: false, error: "Invalid sourceId" };
  if (!b.scope || !VALID_SCOPES.includes(b.scope as string)) return { ok: false, error: "Invalid scope" };

  const opts = b.options as Record<string, unknown> | undefined;
  if (!opts) return { ok: false, error: "Missing options" };
  if (!VALID_LENGTHS.includes(opts.length as string)) return { ok: false, error: "Invalid length" };
  if (!VALID_FORMATS.includes(opts.format as string)) return { ok: false, error: "Invalid format" };

  return {
    ok: true,
    data: {
      bookId: b.bookId as string,
      sourceId: b.sourceId as SourceId,
      scope: b.scope as SummarizeRequest["scope"],
      chapterIndex: typeof b.chapterIndex === "number" ? b.chapterIndex : undefined,
      pageRange: Array.isArray(b.pageRange) ? (b.pageRange as [number, number]) : undefined,
      text: typeof b.text === "string" ? b.text.slice(0, 50000) : undefined,
      options: {
        length: opts.length as SummaryOptions["length"],
        format: opts.format as SummaryOptions["format"],
        spoilerFree: opts.spoilerFree === true,
      },
    },
  };
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

  const cacheKey = makeCacheKey(bookId, sourceId, scope, options, String(chapterIndex ?? pageRange ?? ""));
  const cached = getCached(cacheKey);
  if (cached) {
    // Return cached as a stream — emit the whole text as one token to preserve formatting
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", text: cached, cached: true })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", cached: true })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    let summaryStream: ReadableStream<Uint8Array>;
    let getFullText: () => Promise<string>;

    if (scope === "selection" && text) {
      const result = await summarizeText(text, scope, options);
      summaryStream = result.stream;
      getFullText = result.getFullText;
    } else if (scope === "book") {
      const source = getSource(sourceId);
      const content = await source.getContent(bookId);
      const result = await summarizeBook(content.chapters, options);
      summaryStream = result.stream;
      getFullText = result.getFullText;
    } else if (scope === "chapter" && chapterIndex !== undefined) {
      const source = getSource(sourceId);
      const content = await source.getContent(bookId);
      const chapter = content.chapters[chapterIndex];
      if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
      const result = await summarizeText(chapter.content, scope, options);
      summaryStream = result.stream;
      getFullText = result.getFullText;
    } else if (scope === "page" && pageRange) {
      const source = getSource(sourceId);
      const content = await source.getContent(bookId);
      const pages = content.virtualPages.slice(pageRange[0] - 1, pageRange[1]);
      const pageText = pages.map((p) => p.content).join("\n\n");
      const result = await summarizeText(pageText, scope, options);
      summaryStream = result.stream;
      getFullText = result.getFullText;
    } else {
      return NextResponse.json({ error: "Invalid scope/parameters combination" }, { status: 400 });
    }

    // Cache result after streaming completes
    getFullText().then((full) => {
      if (full) setCached(cacheKey, full);
    });

    return new Response(summaryStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Summarization failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
