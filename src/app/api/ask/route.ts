import { NextRequest, NextResponse } from "next/server";
import { getSource } from "@/lib/sources";
import { sseStream, streamClaude, SSE_HEADERS } from "@/lib/summarize/summarize";
import { checkRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/ip";
import { VALID_SOURCE_IDS } from "@/types";
import type { SourceId } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Was 6,000 characters (~1,000 words) — questions about anything past the
// first few pages of a chapter got "that isn't in the text".
const MAX_CHAPTER_CHARS = 120_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = checkRateLimit(`ask:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  let body: { bookId: string; sourceId: string; chapterIndex: number; question: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bookId, sourceId, chapterIndex, question } = body;
  if (!bookId || !sourceId || !Number.isInteger(chapterIndex) || chapterIndex < 0 || !question?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: "Question too long (max 1000 characters)" }, { status: 400 });
  }
  if (!(VALID_SOURCE_IDS as readonly string[]).includes(sourceId)) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }

  try {
    const content = await getSource(sourceId as SourceId).getContent(bookId);
    const chapter = content.chapters[chapterIndex];
    if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

    const text = chapter.content.slice(0, MAX_CHAPTER_CHARS);
    const system =
      "You are a helpful literary assistant. Answer questions about the provided text accurately and concisely, in plain text. If the answer isn't in the text, say so.";
    const user = `Here is the text of "${chapter.title}":\n\n<text>\n${text}\n</text>\n\nQuestion: ${question}`;

    const stream = sseStream(async (send, signal) => {
      await streamClaude(system, user, 1024, send, signal);
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to answer question";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
