import Anthropic from "@anthropic-ai/sdk";
import type { SummaryOptions, SummaryLength, SummaryFormat, SummaryScope } from "@/types";
import { getAnthropicClient, getModel } from "./client";

// ─── SSE plumbing ────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: "token"; text: string; cached?: boolean }
  | { type: "progress"; message: string }
  | { type: "done"; cached?: boolean }
  | { type: "error"; message: string };

type Send = (event: SSEEvent) => void;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** Turn the Anthropic SDK's errors into something a user (or you, reading Vercel logs) can act on. */
export function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401) return "The Anthropic API key is missing or invalid. Check ANTHROPIC_API_KEY in your Vercel project settings, then redeploy.";
    if (err.status === 404) return `Model "${getModel()}" wasn't found. Check ANTHROPIC_MODEL in your Vercel project settings.`;
    if (err.status === 429) return "The AI service is rate-limited right now. Wait a minute and try again.";
    if (err.status === 529 || err.status === 503) return "The AI service is overloaded right now. Try again shortly.";
    if (err.status === 400) return `The AI request was rejected: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}

/**
 * Wraps work in an SSE stream. If the browser disconnects (user hits Stop or
 * navigates away), the AbortSignal fires so we stop paying for tokens.
 */
export function sseStream(run: (send: Send, signal: AbortSignal) => Promise<void>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abort = new AbortController();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send: Send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      try {
        await run(send, abort.signal);
        send({ type: "done" });
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("[summarize]", err);
          send({ type: "error", message: friendlyError(err) });
        }
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
}

/** Replay a cached summary as a stream, in modest chunks. */
export function cachedTextStream(text: string): ReadableStream<Uint8Array> {
  return sseStream(async (send) => {
    for (let i = 0; i < text.length; i += 2000) {
      send({ type: "token", text: text.slice(i, i + 2000), cached: true });
    }
  });
}

/** Stream a Claude response to the client as token events; resolves with the full text. */
export async function streamClaude(
  system: string,
  user: string,
  maxTokens: number,
  send: Send,
  signal: AbortSignal
): Promise<string> {
  const client = getAnthropicClient();
  const stream = client.messages.stream(
    {
      model: getModel(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    },
    { signal }
  );

  let full = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      full += event.delta.text;
      send({ type: "token", text: event.delta.text });
    }
  }
  return full;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SCOPE_LABEL: Record<SummaryScope, string> = {
  page: "page",
  chapter: "chapter",
  book: "book",
  selection: "selected passage",
};

function lengthRule(length: SummaryLength, scope: SummaryScope): { rule: string; maxTokens: number } {
  switch (length) {
    case "tldr":
      return { rule: "LENGTH: TL;DR — at most 3 sentences (or 3 bullets/takeaways), under 70 words in total.", maxTokens: 300 };
    case "short":
      return { rule: "LENGTH: short — about 120–220 words.", maxTokens: 800 };
    case "detailed":
      return {
        rule:
          scope === "book"
            ? "LENGTH: detailed — about 800–1,300 words covering the whole arc from beginning to end, every major character, and the central themes."
            : "LENGTH: detailed — about 400–800 words covering every significant event, idea, and character, in order.",
        maxTokens: 3000,
      };
  }
}

const FORMAT_RULE: Record<SummaryFormat, string> = {
  paragraph: "FORMAT: flowing prose paragraphs. No bullet points, no numbered lists.",
  bullets: "FORMAT: a bulleted list. Start every line with \"• \". One idea per bullet. No intro sentence before the list.",
  takeaways:
    "FORMAT: numbered key takeaways (\"1. \", \"2. \", …). Each takeaway is one or two sentences stating an insight, theme, or lesson — not just a plot event.",
};

const SPOILER_RULE =
  "SPOILER-FREE: do not reveal twists, deaths, who-did-it, or how anything ends. Cover the premise, setup, characters, and themes only.";

function buildPrompts(
  options: SummaryOptions,
  scope: SummaryScope,
  text: string,
  label?: string
): { system: string; user: string; maxTokens: number } {
  const { rule, maxTokens } = lengthRule(options.length, scope);
  const format = FORMAT_RULE[options.format];
  const rules = [rule, format, options.spoilerFree ? SPOILER_RULE : ""].filter(Boolean);

  const system = [
    `You summarize books for readers. You are summarizing a ${SCOPE_LABEL[scope]}.`,
    "Follow the LENGTH and FORMAT rules exactly — they are the user's explicit choices.",
    ...rules,
    "Write plain text only: no Markdown headings, no bold or italics.",
    "No preamble (\"Here is a summary…\") and no closing remarks. Don't open with \"This book\" or \"This chapter\".",
    "Use only the provided text. If it is front matter, a table of contents, or a license notice rather than story or argument, say so in one sentence instead of inventing content.",
  ].join("\n");

  const what = `${SCOPE_LABEL[scope]}${label ? ` (${label})` : ""}`;
  // Repeating the rules after a long document noticeably improves adherence
  const user = `Summarize the following ${what}.\n\n<text>\n${text}\n</text>\n\nReminder — ${rules.join(" ")}`;

  return { system, user, maxTokens };
}

// ─── Public API ──────────────────────────────────────────────────────────────

interface RunHooks {
  /** Shown to the model for context, e.g. a chapter title */
  label?: string;
  /** Awaited before the stream closes, so the serverless function stays alive for it */
  onComplete?: (fullText: string) => Promise<void> | void;
}

export function summarizeText(
  text: string,
  scope: SummaryScope,
  options: SummaryOptions,
  hooks: RunHooks = {}
): ReadableStream<Uint8Array> {
  return sseStream(async (send, signal) => {
    const { system, user, maxTokens } = buildPrompts(options, scope, text, hooks.label);
    const full = await streamClaude(system, user, maxTokens, send, signal);
    if (hooks.onComplete && full.trim()) await hooks.onComplete(full);
  });
}

// Whole book: map (parallel section notes) → reduce (streamed final summary).
// The old version silently cut books at 160k characters, so "whole book" on a
// novel only covered roughly the first 10–20% of it.

const BATCH_CHARS = 100_000; // ≈25k tokens per section
const MAX_BATCHES = 40;
const CONCURRENCY = 4;

const NOTES_SYSTEM = [
  "You are taking notes on one section of a longer book so the whole book can be summarized later.",
  "Write 250–450 words of dense plain-text notes covering, in order: what happens or what is argued,",
  "people/characters involved (by name) and what changes for them, key ideas or themes, and how the section ends.",
  "Include spoilers — these notes are private. No preamble.",
].join(" ");

function buildBatches(chapters: Array<{ title: string; content: string }>): string[] {
  const total = chapters.reduce((n, c) => n + c.content.length + c.title.length + 8, 0);
  const size = Math.max(BATCH_CHARS, Math.ceil(total / MAX_BATCHES));

  const batches: string[] = [];
  let current = "";
  for (const ch of chapters) {
    let part = `## ${ch.title}\n\n${ch.content}\n\n`;
    while (part.length > 0) {
      if (current.length + part.length <= size) {
        current += part;
        part = "";
      } else if (current.length > 0) {
        batches.push(current);
        current = "";
      } else {
        // A single chapter bigger than a batch: split at a space near the limit
        let cut = part.lastIndexOf(" ", size);
        if (cut < size * 0.8) cut = size;
        batches.push(part.slice(0, cut));
        part = part.slice(cut);
      }
    }
  }
  if (current.trim()) batches.push(current);
  return batches;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

interface BookHooks extends RunHooks {
  /** Section notes don't depend on length/format, so they're cached separately */
  notesCache?: {
    get: () => Promise<string[] | undefined>;
    set: (notes: string[]) => Promise<void>;
  };
}

export function summarizeBook(
  chapters: Array<{ title: string; content: string }>,
  options: SummaryOptions,
  hooks: BookHooks = {}
): ReadableStream<Uint8Array> {
  return sseStream(async (send, signal) => {
    const batches = buildBatches(chapters);

    // Short books fit in one request
    if (batches.length <= 1) {
      const { system, user, maxTokens } = buildPrompts(options, "book", batches[0] ?? "", hooks.label);
      const full = await streamClaude(system, user, maxTokens, send, signal);
      if (hooks.onComplete && full.trim()) await hooks.onComplete(full);
      return;
    }

    let notes = await hooks.notesCache?.get();
    if (!notes || notes.length === 0) {
      const client = getAnthropicClient();
      let finished = 0;
      send({ type: "progress", message: `Reading the book in ${batches.length} sections…` });

      notes = await mapLimit(batches, CONCURRENCY, async (batch, i) => {
        const res = await client.messages.create(
          {
            model: getModel(),
            max_tokens: 1200,
            system: NOTES_SYSTEM,
            messages: [{ role: "user", content: `Section ${i + 1} of ${batches.length}:\n\n${batch}` }],
          },
          { signal, maxRetries: 4 }
        );
        finished++;
        send({ type: "progress", message: `Read ${finished} of ${batches.length} sections…` });
        return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      });

      await hooks.notesCache?.set(notes);
    }

    send({ type: "progress", message: "Writing the summary…" });

    const combined = notes.map((n, i) => `[Section ${i + 1} of ${notes!.length}]\n${n}`).join("\n\n");
    const { system, user, maxTokens } = buildPrompts(
      options,
      "book",
      combined,
      `provided as section-by-section notes that together cover the entire book, in order${hooks.label ? `; ${hooks.label}` : ""}`
    );
    const full = await streamClaude(system, user, maxTokens, send, signal);
    if (hooks.onComplete && full.trim()) await hooks.onComplete(full);
  });
}
