import { describe, it, expect } from "vitest";
import {
  stripHtml,
  countWords,
  parseHtmlChapters,
  parsePlainTextChapters,
  createVirtualPages,
} from "../src/lib/parsing/chapters";

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("converts br to newline", () => {
    expect(stripHtml("line1<br/>line2")).toBe("line1\nline2");
  });

  it("decodes HTML entities", () => {
    expect(stripHtml("AT&amp;T &lt;3 &quot;quotes&quot;")).toBe('AT&T <3 "quotes"');
  });

  it("trims whitespace", () => {
    expect(stripHtml("  <span> hi </span>  ")).toBe("hi");
  });
});

describe("countWords", () => {
  it("counts words in simple text", () => {
    expect(countWords("Hello world foo")).toBe(3);
  });

  it("handles multiple spaces", () => {
    expect(countWords("a  b   c")).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("parseHtmlChapters", () => {
  it("splits on h2 headings", () => {
    const html = `
      <div>Preface content that is longer than 100 characters to make sure it is included as a preface chapter in the output here.</div>
      <h2>Chapter One</h2>
      <p>Content of chapter one, which needs to be long enough. More text here to exceed the minimum length requirement.</p>
      <h2>Chapter Two</h2>
      <p>Content of chapter two, which also needs to be long enough. Adding more text to exceed the minimum length requirement.</p>
    `;
    const chapters = parseHtmlChapters(html, "test");
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    const chapterTitles = chapters.map((c) => c.title);
    expect(chapterTitles).toContain("Chapter One");
    expect(chapterTitles).toContain("Chapter Two");
  });

  it("falls back to single chapter for un-headed text", () => {
    const html = "<p>Just some text without any headings at all.</p>";
    const chapters = parseHtmlChapters(html, "test");
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Full Text");
  });

  it("assigns word counts", () => {
    const html = `<h2>Ch</h2><p>${"word ".repeat(50)}</p>`;
    const chapters = parseHtmlChapters(html, "test");
    const ch = chapters.find((c) => c.title === "Ch");
    expect(ch?.wordCount).toBeGreaterThan(0);
  });
});

describe("parsePlainTextChapters", () => {
  it("detects 'Chapter N' headings", () => {
    const text = [
      "Chapter 1",
      "First chapter content that is more than fifty characters long for sure.",
      "",
      "Chapter 2",
      "Second chapter content that is more than fifty characters long for sure.",
    ].join("\n");
    const chapters = parsePlainTextChapters(text, "test");
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe("Chapter 1");
    expect(chapters[1].title).toBe("Chapter 2");
  });

  it("detects ALL-CAPS headings", () => {
    const text = [
      "INTRODUCTION",
      "This is the intro content that is definitely longer than fifty characters.",
      "",
      "PART ONE",
      "This is part one content that is definitely longer than fifty characters.",
    ].join("\n");
    const chapters = parsePlainTextChapters(text, "test");
    expect(chapters.some((c) => c.title === "INTRODUCTION")).toBe(true);
  });

  it("falls back to single chapter", () => {
    const text = "Just some plain text without any chapter headings at all whatsoever.";
    const chapters = parsePlainTextChapters(text, "test");
    expect(chapters).toHaveLength(1);
  });
});

describe("createVirtualPages", () => {
  it("creates pages of ~300 words", () => {
    const longContent = Array.from({ length: 5 }, (_, i) => `word${i} `).join("").repeat(200);
    const chapters = [
      { id: "c0", index: 0, title: "Chapter", content: longContent, wordCount: 1000 },
    ];
    const pages = createVirtualPages(chapters);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.wordCount).toBeLessThanOrEqual(300);
    }
  });

  it("assigns sequential page numbers", () => {
    const chapters = [
      { id: "c0", index: 0, title: "Ch 1", content: "word ".repeat(400), wordCount: 400 },
      { id: "c1", index: 1, title: "Ch 2", content: "word ".repeat(200), wordCount: 200 },
    ];
    const pages = createVirtualPages(chapters);
    for (let i = 0; i < pages.length; i++) {
      expect(pages[i].pageNumber).toBe(i + 1);
    }
  });

  it("records chapter index on each page", () => {
    const chapters = [
      { id: "c0", index: 0, title: "Ch 1", content: "word ".repeat(600), wordCount: 600 },
      { id: "c1", index: 1, title: "Ch 2", content: "word ".repeat(300), wordCount: 300 },
    ];
    const pages = createVirtualPages(chapters);
    const ch0Pages = pages.filter((p) => p.chapterIndex === 0);
    const ch1Pages = pages.filter((p) => p.chapterIndex === 1);
    expect(ch0Pages.length).toBeGreaterThan(0);
    expect(ch1Pages.length).toBeGreaterThan(0);
  });
});
