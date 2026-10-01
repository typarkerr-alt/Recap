import { describe, it, expect } from "vitest";
import { chunkText } from "../src/lib/parsing/chapters";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const text = "word ".repeat(100).trim();
    const chunks = chunkText(text, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits long text into multiple chunks", () => {
    const text = "word ".repeat(500).trim();
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("respects maxWords per chunk", () => {
    const text = "word ".repeat(1000).trim();
    const chunks = chunkText(text, 300);
    for (const chunk of chunks) {
      const wordCount = chunk.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(300);
    }
  });

  it("preserves all words across chunks", () => {
    const words = Array.from({ length: 700 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text, 200);
    const reconstructed = chunks.join(" ");
    expect(reconstructed).toBe(text);
  });

  it("handles empty string", () => {
    expect(chunkText("", 200)).toEqual([]);
  });

  it("handles text exactly at limit", () => {
    const text = "word ".repeat(200).trim();
    const chunks = chunkText(text, 200);
    expect(chunks).toHaveLength(1);
  });
});

describe("chunkText edge cases", () => {
  it("handles single word", () => {
    const chunks = chunkText("hello", 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("hello");
  });

  it("handles text with extra whitespace", () => {
    const text = "word   word   word";
    const chunks = chunkText(text, 200);
    // Should still work — split on whitespace
    expect(chunks).toHaveLength(1);
  });
});
