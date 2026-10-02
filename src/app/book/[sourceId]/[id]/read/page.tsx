import { notFound } from "next/navigation";
import { getSource } from "@/lib/sources";
import { VALID_SOURCE_IDS } from "@/types";
import type { BookContent, SourceId } from "@/types";
import ReaderClient from "./ReaderClient";

export const runtime = "nodejs";
// Without this, Vercel Hobby (no Fluid compute) kills the render after ~10s —
// often not enough to download and parse a large book on a cold start.
export const maxDuration = 60;

interface Props {
  params: Promise<{ sourceId: string; id: string }>;
  searchParams: Promise<{ ch?: string }>;
}

export default async function ReadPage({ params, searchParams }: Props) {
  const { sourceId, id } = await params;
  const { ch } = await searchParams;

  if (!(VALID_SOURCE_IDS as readonly string[]).includes(sourceId)) notFound();
  const source = getSource(sourceId as SourceId);

  // Metadata and full text in parallel (these used to run one after the other)
  const [bookResult, contentResult] = await Promise.allSettled([source.getBook(id), source.getContent(id)]);

  // A missing book is a real 404; missing full text shows an error in the reader.
  const book = bookResult.status === "fulfilled" ? bookResult.value : notFound();

  let content: BookContent | null = null;
  let contentError: string | null = null;
  if (contentResult.status === "fulfilled") {
    content = contentResult.value;
  } else {
    const reason = contentResult.reason;
    contentError = reason instanceof Error ? reason.message : "Full text not available for this book.";
  }

  const chapters = (content?.chapters ?? []).map(({ index, title, wordCount }) => ({ index, title, wordCount }));

  // "?ch=abc" used to become NaN and request a chapter that doesn't exist
  const parsed = ch !== undefined ? Number.parseInt(ch, 10) : NaN;
  const initialChapter =
    Number.isInteger(parsed) && chapters.length > 0 ? Math.min(Math.max(parsed, 0), chapters.length - 1) : undefined;

  // Ship the opening chapter with the page so reading starts without a second request
  const firstIndex = initialChapter ?? 0;
  const first = content?.chapters[firstIndex];
  const prefetched = first
    ? { index: firstIndex, content: first.html ? "" : first.content, html: first.html ?? null }
    : undefined;

  return (
    <ReaderClient
      bookId={id}
      sourceId={sourceId}
      title={book.title}
      chapters={chapters}
      initialChapter={initialChapter}
      prefetched={prefetched}
      contentError={contentError}
    />
  );
}
