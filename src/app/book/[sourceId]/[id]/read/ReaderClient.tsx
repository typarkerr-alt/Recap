"use client";

import { useCallback } from "react";
import { BookReader } from "@/components/BookReader";

interface Chapter {
  index: number;
  title: string;
  wordCount: number;
}

interface Props {
  bookId: string;
  sourceId: string;
  title: string;
  chapters: Chapter[];
  initialChapter?: number;
  contentError?: string | null;
}

export default function ReaderClient({ bookId, sourceId, title, chapters, initialChapter, contentError }: Props) {
  const getChapterContent = useCallback(
    async (chapterIndex: number): Promise<{ content: string; html?: string | null }> => {
      const res = await fetch(
        `/api/book/${sourceId}/${encodeURIComponent(bookId)}/chapter/${chapterIndex}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to load chapter");
      }
      const data = await res.json() as { content: string; html?: string | null; title: string };
      return { content: data.content ?? "", html: data.html };
    },
    [bookId, sourceId]
  );

  return (
    <BookReader
      bookId={bookId}
      sourceId={sourceId}
      title={title}
      chapters={chapters}
      getChapterContent={getChapterContent}
      initialChapter={initialChapter}
      contentError={contentError}
      key={initialChapter}
    />
  );
}
