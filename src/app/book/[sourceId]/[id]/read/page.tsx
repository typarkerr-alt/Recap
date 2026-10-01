import { notFound } from "next/navigation";
import { BookReader } from "@/components/BookReader";

interface Props {
  params: Promise<{ sourceId: string; id: string }>;
  searchParams: Promise<{ ch?: string }>;
}

async function fetchBookAndChapters(sourceId: string, id: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/book/${sourceId}/${encodeURIComponent(id)}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json();
}

// This is a server component that passes a serializable function to the client
// We instead pass a path that the client will use to fetch content on demand
export default async function ReadPage({ params, searchParams }: Props) {
  const { sourceId, id } = await params;
  const { ch } = await searchParams;

  const data = await fetchBookAndChapters(sourceId, id);
  if (!data) notFound();

  const { book, chapters } = data;
  const initialChapter = ch ? Math.max(0, Math.min(chapters.length - 1, Number(ch))) : undefined;

  return (
    <ReaderWrapper
      bookId={id}
      sourceId={sourceId}
      title={book.title}
      chapters={chapters}
      initialChapter={initialChapter}
    />
  );
}

// Thin wrapper to pass chapter content fetcher
function ReaderWrapper({
  bookId,
  sourceId,
  title,
  chapters,
  initialChapter,
}: {
  bookId: string;
  sourceId: string;
  title: string;
  chapters: Array<{ index: number; title: string; wordCount: number }>;
  initialChapter?: number;
}) {
  return (
    <ReaderClient
      bookId={bookId}
      sourceId={sourceId}
      title={title}
      chapters={chapters}
      initialChapter={initialChapter}
    />
  );
}

// Client component import
import ReaderClient from "./ReaderClient";
