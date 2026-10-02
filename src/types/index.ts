// "standardebooks" was removed: its catalog feeds now require a paid Patrons Circle membership.
export type SourceId = "gutenberg" | "openlibrary" | "archive" | "loc" | "upload";
export const VALID_SOURCE_IDS = ["gutenberg", "openlibrary", "archive", "loc", "upload"] as const;

export interface SearchResult {
  id: string;
  sourceId: SourceId;
  title: string;
  author: string;
  coverUrl?: string;
  year?: number;
  description?: string;
  language?: string;
}

export interface Book extends SearchResult {
  subjects?: string[];
  formats?: Record<string, string>;
  pageCount?: number;
  /** The book's page on the library's own website, where it can be read for free */
  sourceUrl?: string;
}

export interface Chapter {
  id: string;
  index: number;
  title: string;
  content: string; // plain text — used for word count and summarization
  html?: string; // sanitized HTML — used for display in reader when available
  wordCount: number;
}

export interface VirtualPage {
  pageNumber: number;
  chapterIndex: number;
  startWordOffset: number;
  content: string;
  wordCount: number;
}

export interface BookContent {
  bookId: string;
  sourceId: SourceId;
  chapters: Chapter[];
  virtualPages: VirtualPage[];
  totalWordCount: number;
}

export type SummaryLength = "tldr" | "short" | "detailed";
export type SummaryFormat = "paragraph" | "bullets" | "takeaways";
export type SummaryScope = "page" | "chapter" | "book" | "selection";

export interface SummaryOptions {
  length: SummaryLength;
  format: SummaryFormat;
  spoilerFree?: boolean;
}

export interface SummarizeRequest {
  bookId: string;
  sourceId: SourceId;
  scope: SummaryScope;
  chapterIndex?: number;
  pageRange?: [number, number];
  text?: string;
  options: SummaryOptions;
}

export interface SummaryChunk {
  type: "token" | "done" | "error" | "progress";
  text?: string;
  message?: string;
  cached?: boolean;
}
