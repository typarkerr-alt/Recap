import { notFound } from "next/navigation";
import { getSource } from "@/lib/sources";
import type { SourceId } from "@/types";
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

  try {
    const source = getSource(sourceId as SourceId);
    const [book, content] = await Promise.all([source.getBook(id), source.getContent(id)]);

    const chapters = content.chapters.map(({ index, title, wordCount }) => ({ index, title, wordCount }));
    const initialChapter = ch ? Math.max(0, Math.min(chapters.length - 1, Number(ch))) : undefined;

    return (
      <ReaderClient
        bookId={id}
        sourceId={sourceId}
        title={book.title}
        chapters={chapters}
        initialChapter={initialChapter}
      />
    );
  } catch {
    notFound();
  }
}
