import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { storeUpload } from "@/lib/summarize/cache";
import { parseEpub } from "@/lib/parsing/epub";
import { parsePdf } from "@/lib/parsing/pdf";
import { parsePlainTextChapters, createVirtualPages, countWords } from "@/lib/parsing/chapters";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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

  try {
    let content;

    if (pastedText) {
      const chapters = parsePlainTextChapters(pastedText, bookId);
      content = {
        bookId,
        sourceId: "upload" as const,
        chapters,
        virtualPages: createVirtualPages(chapters),
        totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
      };
    } else if (file) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });
      }

      const ext = file.name.split(".").pop()?.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (ext === "epub") {
        content = await parseEpub(buffer, bookId);
      } else if (ext === "pdf") {
        content = await parsePdf(buffer, bookId);
      } else if (ext === "txt" || ext === "text") {
        const text = buffer.toString("utf-8");
        const chapters = parsePlainTextChapters(text, bookId);
        content = {
          bookId,
          sourceId: "upload" as const,
          chapters,
          virtualPages: createVirtualPages(chapters),
          totalWordCount: chapters.reduce((s, c) => s + countWords(c.content), 0),
        };
      } else {
        return NextResponse.json(
          { error: "Unsupported file type. Upload EPUB, PDF, or TXT." },
          { status: 400 }
        );
      }
    }

    if (!content) throw new Error("Failed to process file");

    storeUpload(bookId, content);

    return NextResponse.json({
      bookId,
      sourceId: "upload",
      title: file?.name?.replace(/\.[^.]+$/, "") ?? "Pasted Text",
      chapters: content.chapters.map(({ id, index, title, wordCount }) => ({ id, index, title, wordCount })),
      totalWordCount: content.totalWordCount,
      totalPages: content.virtualPages.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
