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
}

export default function ReaderClient({ bookId, sourceId, title, chapters, initialChapter }: Props) {
  const getChapterContent = useCallback(
    async (chapterIndex: number): Promise<string> => {
      const res = await fetch(
        `/api/book/${sourceId}/${encodeURIComponent(bookId)}/chapter/${chapterIndex}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load chapter");
      }
      const data = await res.json();
      return data.content ?? "";
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
      key={initialChapter}
    />
  );
}
