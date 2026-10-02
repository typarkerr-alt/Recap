import { it, expect, vi } from "vitest";
const calls: string[] = [];
vi.mock("../src/lib/summarize/client", () => ({
  getModel: () => "m",
  getAnthropicClient: () => ({
    messages: {
      create: async (p: any) => { calls.push("map"); return { content: [{ type: "text", text: `notes for ${p.messages[0].content.slice(0, 12)}` }] }; },
      stream: (p: any) => { calls.push("reduce:" + (p.messages[0].content.includes("[Section 3 of 3]") ? "all" : "partial")); return (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: "Final." } }; })(); },
    },
  }),
}));
import { summarizeBook } from "../src/lib/summarize/summarize";

it("reads the whole book in sections, then streams one summary", async () => {
  const chapters = Array.from({ length: 6 }, (_, i) => ({ title: `Ch ${i}`, content: "x ".repeat(24_000) })); // 300k chars
  let saved: string[] | undefined; let done = "";
  const text = await new Response(summarizeBook(chapters, { length: "short", format: "bullets" }, {
    notesCache: { get: async () => undefined, set: async (n) => { saved = n; } },
    onComplete: (t) => { done = t; },
  })).text();
  expect(calls.filter((c) => c === "map")).toHaveLength(3);
  expect(calls).toContain("reduce:all");
  expect(saved).toHaveLength(3);
  expect(done).toBe("Final.");
  expect(text).toContain('"type":"progress"');
  expect(text).toContain('"type":"done"');
});
