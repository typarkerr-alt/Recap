import { it, expect } from "vitest";
import { cachedTextStream } from "../src/lib/summarize/summarize";
import { postSSE } from "../src/lib/sseClient";

it("reassembles events split across arbitrary network chunks", async () => {
  const original = "• Ishmael goes to sea.\n• He meets Queequeg. ".repeat(300);
  const bytes = new Uint8Array(await new Response(cachedTextStream(original)).arrayBuffer());
  // re-chunk into awkward 37-byte pieces (splits mid-JSON and mid-UTF8)
  const rechunked = new ReadableStream<Uint8Array>({
    start(c) { for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37)); c.close(); },
  });
  globalThis.fetch = (async () => new Response(rechunked, { status: 200 })) as typeof fetch;
  let got = "";
  await postSSE("/x", {}, new AbortController().signal, (e) => { if (e.type === "token") got += e.text; });
  expect(got).toBe(original);
});

it("reports a cut-off stream instead of silently showing half a summary", async () => {
  globalThis.fetch = (async () => new Response(`data: {"type":"token","text":"hi"}\n\n`, { status: 200 })) as typeof fetch;
  await expect(postSSE("/x", {}, new AbortController().signal, () => {})).rejects.toThrow(/cut off/);
});
