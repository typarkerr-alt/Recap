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

interface ParseHtmlOpts {
  // When true, each chapter also gets an `html` field with the raw body HTML
  keepHtml?: boolean;
}

// Detect chapters from heading-based HTML
export function parseHtmlChapters(html: string, bookId: string, opts: ParseHtmlOpts = {}): Chapter[] {
  // Split on h1–h3 headings
  const chapterPattern = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  const parts = html.split(chapterPattern);

  const chapters: Chapter[] = [];
  let i = 0;

  // First part is preface/intro before first heading
  if (parts[0] && stripHtml(parts[0]).trim().length > 100) {
    const bodyHtml = parts[0];
    const content = stripHtml(bodyHtml);
    chapters.push({
      id: `${bookId}-ch0`,
      index: 0,
      title: "Preface",
      content,
      html: opts.keepHtml ? bodyHtml : undefined,
      wordCount: countWords(content),
    });
  }

  while (i < parts.length - 1) {
    const headingIndex = i % 2 === 0 ? i + 1 : i;
    const bodyIndex = headingIndex + 1;

    if (headingIndex < parts.length && bodyIndex < parts.length) {
      const title = stripHtml(parts[headingIndex]).trim();
      const bodyHtml = parts[bodyIndex] ?? "";
      const content = stripHtml(bodyHtml).trim();

      if (title && content.length > 50) {
        const idx = chapters.length;
        chapters.push({
          id: `${bookId}-ch${idx}`,
          index: idx,
          title: title || `Chapter ${idx + 1}`,
          content,
          html: opts.keepHtml ? bodyHtml : undefined,
          wordCount: countWords(content),
        });
      }
    }
    i += 2;
  }

  // Fallback: treat the whole text as one chapter
  if (chapters.length === 0) {
    const content = stripHtml(html);
    return [
      {
        id: `${bookId}-ch0`,
        index: 0,
        title: "Full Text",
        content,
        html: opts.keepHtml ? html : undefined,
        wordCount: countWords(content),
      },
    ];
  }

  return chapters;
}

// Parse plain-text chapters by detecting headings (all-caps lines, "Chapter N", etc.)
export function parsePlainTextChapters(text: string, bookId: string): Chapter[] {
  const lines = text.split("\n");
  const chapterBoundaries: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isChapterHeading =
      /^(chapter|part|book|section|prologue|epilogue|introduction|preface|appendix)\s/i.test(line) ||
      (line === line.toUpperCase() && line.length > 3 && line.length < 80 && /[A-Z]/.test(line));

    if (isChapterHeading) {
      chapterBoundaries.push(i);
    }
  }

  if (chapterBoundaries.length < 2) {
    return [
      {
        id: `${bookId}-ch0`,
        index: 0,
        title: "Full Text",
        content: text.trim(),
        wordCount: countWords(text),
      },
    ];
  }

  const chapters: Chapter[] = [];
  for (let b = 0; b < chapterBoundaries.length; b++) {
    const start = chapterBoundaries[b];
    const end = b + 1 < chapterBoundaries.length ? chapterBoundaries[b + 1] : lines.length;
    const title = lines[start].trim();
    const content = lines
      .slice(start + 1, end)
      .join("\n")
      .trim();

    if (content.length > 50) {
      chapters.push({
        id: `${bookId}-ch${b}`,
        index: b,
        title: title || `Chapter ${b + 1}`,
        content,
        wordCount: countWords(content),
      });
    }
  }

  return chapters.length > 0 ? chapters : parsePlainTextChapters(text, bookId);
}

export function createVirtualPages(chapters: Chapter[]): VirtualPage[] {
  const pages: VirtualPage[] = [];
  let pageNumber = 1;

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const words = chapter.content.split(/\s+/).filter(Boolean);
    let offset = 0;

    while (offset < words.length) {
      const pageWords = words.slice(offset, offset + WORDS_PER_PAGE);
      const content = pageWords.join(" ");
      pages.push({
        pageNumber,
        chapterIndex: ci,
        startWordOffset: offset,
        content,
        wordCount: pageWords.length,
      });
      pageNumber++;
      offset += WORDS_PER_PAGE;
    }
  }

  return pages;
}

// Chunk long text into pieces for LLM summarization (~2000 words each)
export function chunkText(text: string, maxWords = 2000): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}
