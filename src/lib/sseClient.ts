// Browser-side SSE reader for /api/summarize and /api/ask.
//
// The old readers parsed each network chunk on its own. On Vercel, events
// regularly arrive split across chunks, so JSON.parse failed on the halves and
// the tokens were silently dropped — sometimes the whole (cached) summary.
// This buffers until a full "\n\n"-terminated event has arrived.

export interface StreamEvent {
  type: "token" | "progress" | "done" | "error";
  text?: string;
  message?: string;
  cached?: boolean;
}

export async function postSSE(
  url: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Vercel's own error pages aren't JSON
      if (res.status === 504) message = "The server timed out. Try a smaller scope or try again.";
      if (res.status === 413) message = "That request was too large for the server.";
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error("No response stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  for (;;) {
    const { done, value } = await reader.read();
    buffer += value ? decoder.decode(value, { stream: true }) : decoder.decode();

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const data = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;

      let event: StreamEvent;
      try {
        event = JSON.parse(data) as StreamEvent;
      } catch {
        continue;
      }

      if (event.type === "error") throw new Error(event.message || "Something went wrong");
      if (event.type === "done") finished = true;
      onEvent(event);
    }

    if (done) break;
  }

  if (!finished) {
    throw new Error("The response was cut off before it finished (likely a server timeout). Please try again.");
  }
}
