import { NextRequest, NextResponse } from "next/server";
import { getSource } from "@/lib/sources";
import { getAnthropicClient, getModel } from "@/lib/summarize/client";
import { checkRateLimit } from "@/lib/ratelimit";
import type { SourceId } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { allowed, retryAfter } = checkRateLimit(ip);
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
  if (!bookId || !sourceId || typeof chapterIndex !== "number" || !question?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: "Question too long (max 1000 characters)" }, { status: 400 });
  }

  const validSources = ["gutenberg", "openlibrary", "standardebooks", "upload"];
  if (!validSources.includes(sourceId)) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }

  try {
    const source = getSource(sourceId as SourceId);
    const content = await source.getContent(bookId);
    const chapter = content.chapters[chapterIndex];
    if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

    const client = getAnthropicClient();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (chunk: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(chunk)}\n\n`));

        try {
          const anthropicStream = client.messages.stream({
            model: getModel(),
            max_tokens: 1024,
            system: "You are a helpful literary assistant. Answer questions about the provided text accurately and concisely. If the answer isn't in the text, say so.",
            messages: [
              {
                role: "user",
                content: `Here is a passage from "${chapter.title}":\n\n${chapter.content.slice(0, 6000)}\n\n---\n\nQuestion: ${question}`,
              },
            ],
          });

          for await (const event of anthropicStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "token", text: event.delta.text });
            }
          }
          send({ type: "done" });
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : "AI error" });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to answer question";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
