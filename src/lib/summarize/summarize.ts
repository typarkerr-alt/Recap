import type { SummaryOptions, SummaryLength, SummaryFormat, SummaryScope } from "@/types";
import { getAnthropicClient, getModel } from "./client";

function buildSystemPrompt(options: SummaryOptions, scope: SummaryScope): string {
  const lengthGuide: Record<SummaryLength, string> = {
    tldr: "Write a TL;DR of 2-3 sentences maximum.",
    short: "Write a concise summary of 1-2 short paragraphs.",
    detailed: "Write a detailed, thorough summary covering all key points.",
  };

  const formatGuide: Record<SummaryFormat, string> = {
    paragraph: "Write in flowing prose paragraphs.",
    bullets: "Use bullet points (•) for each key idea.",
    takeaways: "Format as numbered key takeaways.",
  };

  const spoiler = options.spoilerFree
    ? "IMPORTANT: Do NOT reveal plot twists, surprise endings, or major reveals. Describe themes and early plot only."
    : "";

  return [
    `You are an expert book summarizer creating a ${scope}-level summary.`,
    lengthGuide[options.length],
    formatGuide[options.format],
    spoiler,
    "Be accurate, concise, and helpful. Do not pad with filler phrases.",
    "Do not start with 'This book...' or 'This chapter...' — dive straight into content.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(text: string, scope: SummaryScope): string {
  const scopeLabel: Record<SummaryScope, string> = {
    page: "page",
    chapter: "chapter",
    book: "book",
    selection: "selected passage",
  };
  return `Please summarize the following ${scopeLabel[scope]}:\n\n${text}`;
}

// Single-chunk summarization — returns a ReadableStream of SSE data
export async function summarizeText(
  text: string,
  scope: SummaryScope,
  options: SummaryOptions
): Promise<{ stream: ReadableStream<Uint8Array>; getFullText: () => Promise<string> }> {
  const client = getAnthropicClient();
  const model = getModel();
  const encoder = new TextEncoder();
  let fullText = "";
  let resolve: (v: string) => void;
  const fullTextPromise = new Promise<string>((r) => (resolve = r));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 4096,
          system: buildSystemPrompt(options, scope),
          messages: [{ role: "user", content: buildUserPrompt(text, scope) }],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            const data = `data: ${JSON.stringify({ type: "token", text: event.delta.text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
        resolve(fullText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
        controller.close();
        resolve(fullText);
      }
    },
  });

  return { stream, getFullText: () => fullTextPromise };
}

// Single-pass whole-book summarization — concatenates all chapters and sends one API call.
// This is vastly faster than per-chapter map-reduce and stays well within Vercel's timeout.
export async function summarizeBook(
  chapters: Array<{ title: string; content: string }>,
  options: SummaryOptions,
): Promise<{ stream: ReadableStream<Uint8Array>; getFullText: () => Promise<string> }> {
  // Build the full book text, capped at ~160k chars (~40k tokens) to fit Claude's context
  const MAX_CHARS = 160_000;
  const parts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  for (const ch of chapters) {
    const part = `## ${ch.title}\n\n${ch.content}\n\n`;
    if (totalChars + part.length > MAX_CHARS) {
      const remaining = MAX_CHARS - totalChars;
      if (remaining > 500) parts.push(part.slice(0, remaining) + "…");
      truncated = true;
      break;
    }
    parts.push(part);
    totalChars += part.length;
  }

  const bookText =
    parts.join("") +
    (truncated ? "\n\n(Note: Summary based on the first portion of this book.)" : "");

  return summarizeText(bookText, "book", options);
}
