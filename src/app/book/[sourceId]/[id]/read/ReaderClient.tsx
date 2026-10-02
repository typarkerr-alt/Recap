"use client";

import { useCallback } from "react";
import { BookReader, type PrefetchedChapter } from "@/components/BookReader";

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
  prefetched?: PrefetchedChapter;
  contentError?: string | null;
}

export default function ReaderClient({ bookId, sourceId, title, chapters, initialChapter, prefetched, contentError }: Props) {
  const getChapterContent = useCallback(
    async (chapterIndex: number): Promise<{ content: string; html?: string | null }> => {
      const res = await fetch(`/api/book/${sourceId}/${encodeURIComponent(bookId)}/chapter/${chapterIndex}`);
      if (!res.ok) {
        // Vercel timeout pages (504) aren't JSON
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error ?? (res.status === 504 ? "The server took too long to load this chapter." : `Couldn't load chapter (${res.status}).`)
        );
      }
      const data = (await res.json()) as { content: string; html?: string | null };
      return { content: data.content ?? "", html: data.html };
    },
    [bookId, sourceId]
  );

  return (
    <BookReader
      key={initialChapter}
      bookId={bookId}
      sourceId={sourceId}
      title={title}
      chapters={chapters}
      getChapterContent={getChapterContent}
      initialChapter={initialChapter}
      prefetched={prefetched}
      contentError={contentError}
    />
  );
}
