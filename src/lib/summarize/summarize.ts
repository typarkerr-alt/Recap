import type { SummaryOptions, SummaryLength, SummaryFormat, SummaryScope } from "@/types";
import { getAnthropicClient, getModel } from "./client";
import { chunkText } from "../parsing/chapters";

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
          max_tokens: 2048,
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

// Map-reduce for whole-book summarization
export async function summarizeBook(
  chapters: Array<{ title: string; content: string }>,
  options: SummaryOptions,
  onProgress?: (msg: string) => void
): Promise<{ stream: ReadableStream<Uint8Array>; getFullText: () => Promise<string> }> {
  const client = getAnthropicClient();
  const model = getModel();
  const encoder = new TextEncoder();
  let fullText = "";
  let resolveFullText: (v: string) => void;
  const fullTextPromise = new Promise<string>((r) => (resolveFullText = r));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const chapterSummaries: string[] = [];

        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const progressMsg = `Summarizing chapter ${i + 1} of ${chapters.length}: ${ch.title}`;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", message: progressMsg })}\n\n`)
          );
          onProgress?.(progressMsg);

          // Chunk long chapters
          const chunks = chunkText(ch.content, 2000);
          const chunkSummaries: string[] = [];

          for (const chunk of chunks) {
            const res = await client.messages.create({
              model,
              max_tokens: 512,
              system: `You are summarizing chapter ${i + 1} ("${ch.title}") of a book. Write a brief, accurate 2-3 sentence summary of this passage.`,
              messages: [{ role: "user", content: chunk }],
            });
            const text = res.content[0].type === "text" ? res.content[0].text : "";
            chunkSummaries.push(text);
          }

          chapterSummaries.push(`**${ch.title}**: ${chunkSummaries.join(" ")}`);
        }

        // Final synthesis
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "progress", message: "Synthesizing final summary…" })}\n\n`
          )
        );

        const synthesis = chapterSummaries.join("\n\n");
        const finalStream = client.messages.stream({
          model,
          max_tokens: 2048,
          system: buildSystemPrompt(options, "book"),
          messages: [
            {
              role: "user",
              content: `Here are summaries of each chapter:\n\n${synthesis}\n\nNow write a unified summary of the entire book.`,
            },
          ],
        });

        for await (const event of finalStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", text: event.delta.text })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
        resolveFullText(fullText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";

        // Retry once on rate limit
        if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
          await new Promise((r) => setTimeout(r, 5000));
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", message: "Rate limited — retrying…" })}\n\n`)
          );
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
        controller.close();
        resolveFullText(fullText);
      }
    },
  });

  return { stream, getFullText: () => fullTextPromise };
}
