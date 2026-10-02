import { NextRequest, NextResponse } from "next/server";
import { getSource } from "@/lib/sources";
import { VALID_SOURCE_IDS } from "@/types";
import type { SourceId } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ sourceId: string; id: string; chapterIndex: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { sourceId, id, chapterIndex } = await params;

  if (!(VALID_SOURCE_IDS as readonly string[]).includes(sourceId)) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }

  const idx = Number(chapterIndex);
  if (!Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  try {
    const content = await getSource(sourceId as SourceId).getContent(id);
    const chapter = content.chapters[idx];
    if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

    return NextResponse.json(
      {
        // The reader only needs one of these; sending both doubled the payload
        content: chapter.html ? "" : chapter.content,
        html: chapter.html ?? null,
        title: chapter.title,
      },
      {
        headers: {
          // Public-domain chapters never change, so let Vercel's CDN serve repeat
          // reads without running the function (purged on each deploy). Uploads stay private.
          "Cache-Control":
            sourceId === "upload" ? "private, no-store" : "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch chapter";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
