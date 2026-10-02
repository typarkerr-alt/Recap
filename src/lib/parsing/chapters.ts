import type { Chapter, VirtualPage } from "@/types";

const WORDS_PER_PAGE = 300;

// Strip HTML tags, keeping basic structure cues
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Remove Project Gutenberg's license header and footer. Without this, the
 * license boilerplate becomes "Chapter 1" and pollutes whole-book summaries.
 * Safe to call on any text — it's a no-op when the markers are absent.
 */
export function stripGutenbergBoilerplate(text: string): string {
  let out = text;
  const start = out.match(/\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^*]*\*{3}/i);
  if (start && start.index !== undefined) {
    out = out.slice(start.index + start[0].length);
  }
  const end = out.search(/\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK/i);
  if (end !== -1) out = out.slice(0, end);
  return out;
}

/**
 * Clean OCR text from scanned books (Internet Archive, Library of Congress):
 * re-join words hyphenated across line breaks, drop form feeds and stray control chars.
 */
export function cleanOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\f\v\u0000-\u0008\u000E-\u001F]/g, "\n")
    .replace(/([a-z])-\n\s*([a-z])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n");
}

// Chapters longer than this get split into parts, so "summarize this chapter" never
// sends an entire unstructured scan (often 100k+ words) in one request.
const MAX_CHAPTER_WORDS = 12_000;

function splitOversized(chapters: Chapter[], bookId: string): Chapter[] {
  const out: Chapter[] = [];
  for (const ch of chapters) {
    if (ch.wordCount <= MAX_CHAPTER_WORDS) {
      out.push(ch);
      continue;
    }
    const paragraphs = ch.content.split(/\n\s*\n/);
    const parts: string[] = [];
    let current: string[] = [];
    let words = 0;
    for (const para of paragraphs) {
      const n = countWords(para);
      if (words + n > MAX_CHAPTER_WORDS && current.length > 0) {
        parts.push(current.join("\n\n"));
        current = [];
        words = 0;
      }
      // A single giant "paragraph" (OCR without blank lines) — hard-split by words
      if (n > MAX_CHAPTER_WORDS) {
        const w = para.split(/\s+/);
        for (let i = 0; i < w.length; i += MAX_CHAPTER_WORDS) parts.push(w.slice(i, i + MAX_CHAPTER_WORDS).join(" "));
        continue;
      }
      current.push(para);
      words += n;
    }
    if (current.length > 0) parts.push(current.join("\n\n"));

    parts.forEach((content, i) => {
      const title = ch.title === "Full Text" ? `Part ${i + 1}` : `${ch.title} (part ${i + 1} of ${parts.length})`;
      out.push({ id: "", index: 0, title, content, wordCount: countWords(content) }); // html dropped for split parts
    });
  }
  // Re-number so chapters[i].index === i
  return out.map((c, i) => ({ ...c, id: `${bookId}-ch${i}`, index: i }));
}

// Headings that are navigation, not content
const SKIP_TITLES = /^(table of )?contents$|^(list of )?illustrations$|^index$/i;

function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function isSkippableTitle(title: string): boolean {
  return SKIP_TITLES.test(title.replace(/[.:\s]+$/, ""));
}

interface ParseHtmlOpts {
  // When true, each chapter also gets an `html` field with the raw body HTML
  keepHtml?: boolean;
}

// Detect chapters from heading-based HTML
export function parseHtmlChapters(html: string, bookId: string, opts: ParseHtmlOpts = {}): Chapter[] {
  const body = stripGutenbergBoilerplate(html);

  // Split on h1–h3 headings. With a capture group, split() yields
  // [before, heading1, body1, heading2, body2, ...]
  const parts = body.split(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi);

  const chapters: Chapter[] = [];
  const push = (title: string, bodyHtml: string, content: string) => {
    const idx = chapters.length;
    chapters.push({
      id: `${bookId}-ch${idx}`,
      index: idx, // always equals array position, so chapters[i].index === i
      title,
      content,
      html: opts.keepHtml ? bodyHtml : undefined,
      wordCount: countWords(content),
    });
  };

  const intro = parts[0] ?? "";
  const introText = stripHtml(intro);
  if (introText.length > 100) push("Front Matter", intro, introText);

  for (let h = 1; h + 1 < parts.length; h += 2) {
    const title = cleanTitle(stripHtml(parts[h]));
    const bodyHtml = parts[h + 1] ?? "";
    const content = stripHtml(bodyHtml).trim();
    if (!title || content.length <= 50 || isSkippableTitle(title)) continue;
    push(title, bodyHtml, content);
  }

  if (chapters.length === 0) {
    const content = stripHtml(body);
    return splitOversized(
      [
        {
          id: `${bookId}-ch0`,
          index: 0,
          title: "Full Text",
          content,
          html: opts.keepHtml ? body : undefined,
          wordCount: countWords(content),
        },
      ],
      bookId
    );
  }

  return splitOversized(chapters, bookId);
}

const HEADING_WORD =
  /^(chapter|part|book|section|prologue|epilogue|introduction|preface|foreword|afterword|appendix|letter|stave|canto)\b/i;

function looksLikeHeading(line: string): boolean {
  if (line.length > 70) return false;
  if (HEADING_WORD.test(line)) return true;
  // ALL-CAPS lines like "THE SPOUTER-INN" — short, has letters, no lowercase
  const words = line.split(/\s+/).length;
  return (
    line.length > 3 &&
    words <= 10 &&
    /[A-Z]/.test(line) &&
    line === line.toUpperCase() &&
    !/[,;]$/.test(line)
  );
}

// Parse plain-text chapters by detecting headings ("Chapter N", short ALL-CAPS lines)
export function parsePlainTextChapters(text: string, bookId: string): Chapter[] {
  const cleaned = stripGutenbergBoilerplate(text).replace(/\r\n?/g, "\n");
  const lines = cleaned.split("\n");
  const boundaries: number[] = [];

  const candidates: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Real headings start a block: first line, or preceded by a blank line
    const afterBlank = i === 0 || lines[i - 1].trim() === "";
    if (afterBlank && looksLikeHeading(line)) candidates.push(i);
  }

  // Scanned books repeat the book title at the top of every page ("MOBY DICK 23").
  // Those running heads aren't chapters — drop ALL-CAPS candidates that repeat.
  const runningKey = (line: string) => line.trim().replace(/[\d\s.,]+/g, " ").trim();
  const freq = new Map<string, number>();
  for (const i of candidates) {
    const key = runningKey(lines[i]);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  for (const i of candidates) {
    const line = lines[i].trim();
    if (!HEADING_WORD.test(line) && (freq.get(runningKey(line)) ?? 0) >= 3) continue;
    boundaries.push(i);
  }

  const fullText = (): Chapter[] => [
    {
      id: `${bookId}-ch0`,
      index: 0,
      title: "Full Text",
      content: cleaned.trim(),
      wordCount: countWords(cleaned),
    },
  ];

  if (boundaries.length < 2) return splitOversized(fullText(), bookId);

  const chapters: Chapter[] = [];

  // Text before the first heading (dedication, epigraph, etc.)
  const intro = lines.slice(0, boundaries[0]).join("\n").trim();
  if (intro.length > 100) {
    chapters.push({ id: `${bookId}-ch0`, index: 0, title: "Front Matter", content: intro, wordCount: countWords(intro) });
  }

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b];
    const end = b + 1 < boundaries.length ? boundaries[b + 1] : lines.length;
    const title = cleanTitle(lines[start]);
    const content = lines.slice(start + 1, end).join("\n").trim();

    // Short blocks are table-of-contents entries or "PART ONE" dividers — skip them
    if (content.length <= 50 || isSkippableTitle(title)) continue;

    const idx = chapters.length;
    chapters.push({
      id: `${bookId}-ch${idx}`,
      index: idx,
      title: title || `Chapter ${idx + 1}`,
      content,
      wordCount: countWords(content),
    });
  }

  // (The old version recursed into itself here with the same input — an infinite loop.)
  return splitOversized(chapters.length > 0 ? chapters : fullText(), bookId);
}

export function createVirtualPages(chapters: Chapter[]): VirtualPage[] {
  const pages: VirtualPage[] = [];
  let pageNumber = 1;

  for (let ci = 0; ci < chapters.length; ci++) {
    const words = chapters[ci].content.split(/\s+/).filter(Boolean);
    for (let offset = 0; offset < words.length; offset += WORDS_PER_PAGE) {
      const pageWords = words.slice(offset, offset + WORDS_PER_PAGE);
      pages.push({
        pageNumber: pageNumber++,
        chapterIndex: ci,
        startWordOffset: offset,
        content: pageWords.join(" "),
        wordCount: pageWords.length,
      });
    }
  }

  return pages;
}

// Chunk long text into pieces by word count
export function chunkText(text: string, maxWords = 2000): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}
