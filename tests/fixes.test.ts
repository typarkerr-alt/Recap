import { describe, it, expect } from "vitest";
import { parsePlainTextChapters, parseHtmlChapters, stripGutenbergBoilerplate } from "../src/lib/parsing/chapters";

const filler = "This sentence is long enough to count as real chapter content for the parser. ".repeat(3);

describe("stripGutenbergBoilerplate", () => {
  it("removes the license header and footer", () => {
    const text = `Project Gutenberg license blah\n*** START OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***\nReal text\n*** END OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***\nMore license`;
    expect(stripGutenbergBoilerplate(text).trim()).toBe("Real text");
  });

  it("is a no-op without markers", () => {
    expect(stripGutenbergBoilerplate("hello")).toBe("hello");
  });
});

describe("chapter indexes match array positions", () => {
  it("plain text: skipped TOC entries don't shift indexes", () => {
    const text = [
      "CONTENTS", "", "CHAPTER I", "", "CHAPTER II", "",
      "CHAPTER I", filler, "", "CHAPTER II", filler,
    ].join("\n");
    const chapters = parsePlainTextChapters(text, "t");
    expect(chapters.map((c) => c.title)).toEqual(["CHAPTER I", "CHAPTER II"]);
    chapters.forEach((c, i) => expect(c.index).toBe(i));
  });

  it("html: skips Contents and keeps indexes sequential", () => {
    const html = `<h2>Contents</h2><p>${filler}</p><h2>Chapter 1</h2><p>${filler}</p><h2>Chapter 2</h2><p>${filler}</p>`;
    const chapters = parseHtmlChapters(html, "t");
    expect(chapters.map((c) => c.title)).toEqual(["Chapter 1", "Chapter 2"]);
    chapters.forEach((c, i) => expect(c.index).toBe(i));
  });
});

describe("parsePlainTextChapters", () => {
  it("does not recurse forever when every block is tiny", () => {
    const text = ["CHAPTER I", "short", "", "CHAPTER II", "short"].join("\n");
    const chapters = parsePlainTextChapters(text, "t");
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Full Text");
  });

  it("ignores ALL-CAPS lines in the middle of a paragraph", () => {
    const text = ["CHAPTER I", filler, "STOP RIGHT THERE", filler, "", "CHAPTER II", filler].join("\n");
    const chapters = parsePlainTextChapters(text, "t");
    expect(chapters.map((c) => c.title)).toEqual(["CHAPTER I", "CHAPTER II"]);
  });
});
