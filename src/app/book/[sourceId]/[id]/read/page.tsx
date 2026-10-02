import { notFound } from "next/navigation";
import { getSource } from "@/lib/sources";
import type { BookContent, SourceId } from "@/types";
import ReaderClient from "./ReaderClient";

interface Props {
  params: Promise<{ sourceId: string; id: string }>;
  searchParams: Promise<{ ch?: string }>;
}

export default async function ReadPage({ params, searchParams }: Props) {
  const { sourceId, id } = await params;
  const { ch } = await searchParams;

  const validSources = ["gutenberg", "openlibrary", "standardebooks", "upload"];
  if (!validSources.includes(sourceId)) notFound();

  const source = getSource(sourceId as SourceId);

  // A missing book is a real 404; missing full text shows an error in the reader.
  let bookTitle = "Book";
  try {
    const book = await source.getBook(id);
    bookTitle = book.title;
  } catch {
    notFound();
  }

  let content: BookContent | null = null;
  let contentError: string | null = null;
  try {
    content = await source.getContent(id);
  } catch (e) {
    contentError = e instanceof Error ? e.message : "Full text not available for this book.";
  }

  const chapters = (content?.chapters ?? []).map(({ index, title, wordCount }) => ({ index, title, wordCount }));
  const initialChapter = ch ? Math.max(0, Math.min(Math.max(chapters.length - 1, 0), Number(ch))) : undefined;

  return (
    <ReaderClient
      bookId={id}
      sourceId={sourceId}
      title={bookTitle}
      chapters={chapters}
      initialChapter={initialChapter}
      contentError={contentError}
    />
  );
}
