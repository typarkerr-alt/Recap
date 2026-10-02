import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { storeUpload } from "@/lib/summarize/cache";
import { parseEpub } from "@/lib/parsing/epub";
import { parsePdf } from "@/lib/parsing/pdf";
import { parsePlainTextChapters, createVirtualPages, countWords } from "@/lib/parsing/chapters";
import type { BookContent } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Functions reject request bodies over 4.5 MB before this code runs.
// 4 MB leaves room for multipart overhead.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

function fromText(text: string, bookId: string): BookContent {
  const chapters = parsePlainTextChapters(text, bookId);
  return {
    bookId,
    sourceId: "upload",
    chapters,
    virtualPages: createVirtualPages(chapters),
    totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
  };
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const pastedText = formData.get("text") as string | null;

  if (!file && !pastedText) {
    return NextResponse.json({ error: "No file or text provided" }, { status: 400 });
  }

  const bookId = uuidv4();
  const title = file?.name?.replace(/\.[^.]+$/, "") || "Pasted Text";

  try {
    let content: BookContent | undefined;

    if (pastedText) {
      content = fromText(pastedText, bookId);
    } else if (file) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
      }

      const ext = file.name.split(".").pop()?.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (ext === "epub") {
        content = await parseEpub(buffer, bookId);
      } else if (ext === "pdf") {
        content = await parsePdf(buffer, bookId);
      } else if (ext === "txt" || ext === "text") {
        content = fromText(buffer.toString("utf-8"), bookId);
      } else {
        return NextResponse.json({ error: "Unsupported file type. Upload EPUB, PDF, or TXT." }, { status: 400 });
      }
    }

    if (!content) throw new Error("Failed to process file");

    await storeUpload(bookId, content, title);

    return NextResponse.json({
      bookId,
      sourceId: "upload",
      title,
      chapters: content.chapters.map(({ id, index, title, wordCount }) => ({ id, index, title, wordCount })),
      totalWordCount: content.totalWordCount,
      totalPages: content.virtualPages.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
