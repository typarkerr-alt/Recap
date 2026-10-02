import { NextRequest, NextResponse } from "next/server";
import { getSource } from "@/lib/sources";
import type { SourceId } from "@/types";

interface Params {
  params: Promise<{ sourceId: string; id: string; chapterIndex: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { sourceId, id, chapterIndex } = await params;

  const validSources = ["gutenberg", "openlibrary", "standardebooks", "upload"];
  if (!validSources.includes(sourceId)) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }

  const idx = Number(chapterIndex);
  if (!Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  try {
    const source = getSource(sourceId as SourceId);
    const content = await source.getContent(id);
    const chapter = content.chapters[idx];
    if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

    return NextResponse.json({
      content: chapter.content,
      html: chapter.html ?? null,
      title: chapter.title,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch chapter";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
