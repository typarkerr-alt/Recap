import type { BookContent } from "@/types";
import { parsePlainTextChapters, createVirtualPages, countWords } from "./chapters";

export async function parsePdf(buffer: Buffer, bookId: string): Promise<BookContent> {
  // Dynamic require to avoid pdf-parse running its test suite on module load
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");

  const data = await pdfParse(buffer);
  const text: string = data.text;

  if (!text || text.trim().length === 0) {
    throw new Error("Could not extract text from PDF");
  }

  const chapters = parsePlainTextChapters(text, bookId);

  return {
    bookId,
    sourceId: "upload",
    chapters,
    virtualPages: createVirtualPages(chapters),
    totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
  };
}
