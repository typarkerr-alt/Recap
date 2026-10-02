import { NextRequest, NextResponse } from "next/server";
import { getSource } from "@/lib/sources";
import { VALID_SOURCE_IDS } from "@/types";
import type { SourceId } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ sourceId: string; id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { sourceId, id } = await params;

  if (!id || id.length > 200) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }
  if (!(VALID_SOURCE_IDS as readonly string[]).includes(sourceId)) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }

  try {
    const source = getSource(sourceId as SourceId);
    const [book, content] = await Promise.all([source.getBook(id), source.getContent(id)]);

    // Strip chapter content from the book endpoint — content is large
    const chapters = content.chapters.map(({ id: cid, index, title, wordCount }) => ({ id: cid, index, title, wordCount }));

    return NextResponse.json({
      book,
      chapters,
      totalWordCount: content.totalWordCount,
      totalPages: content.virtualPages.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch book";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
