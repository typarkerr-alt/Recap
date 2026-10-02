import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SummarizePanel } from "@/components/SummarizePanel";
import { getSource } from "@/lib/sources";
import { VALID_SOURCE_IDS } from "@/types";
import type { Book, BookContent, SourceId } from "@/types";
import { SOURCE_LABELS } from "@/lib/sources/labels";

// Downloading + parsing a large Gutenberg book on a cold instance can take a while
export const maxDuration = 60;

interface Props {
  params: Promise<{ sourceId: string; id: string }>;
}

// Scanned books: the text comes from OCR, so expect the odd typo
const OCR_SOURCES = new Set(["archive", "loc"]);

export default async function BookPage({ params }: Props) {
  const { sourceId, id } = await params;

  if (!(VALID_SOURCE_IDS as readonly string[]).includes(sourceId)) notFound();

  const source = getSource(sourceId as SourceId);

  // A missing book is a real 404; missing full text is a soft error shown on the page.
  let book: Book;
  try {
    book = await source.getBook(id);
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
  const totalWordCount = content?.totalWordCount ?? 0;
  const totalPages = content?.virtualPages.length ?? 0;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
        <Link href="/" className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <span className="text-xl" aria-hidden="true">📚</span>
          <span className="font-bold">Recap</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Book header */}
        <div className="flex gap-6">
          <div className="relative hidden h-48 w-32 shrink-0 overflow-hidden rounded-lg bg-gray-100 shadow-md dark:bg-gray-800 sm:block">
            {book.coverUrl ? (
              <Image src={book.coverUrl} alt={`Cover of ${book.title}`} fill className="object-cover" sizes="128px" unoptimized />
            ) : (
              <div className="flex h-full items-center justify-center text-5xl" aria-hidden="true">📖</div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">{book.title}</h1>
                <p className="mt-1 text-gray-600 dark:text-gray-400">{book.author}</p>
              </div>
              <span className={`source-badge source-badge-${sourceId} mt-1 shrink-0`}>
                {SOURCE_LABELS[sourceId] ?? sourceId}
              </span>
            </div>

            {content && (
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span>{chapters.length} chapters</span>
                <span>·</span>
                <span>{totalWordCount.toLocaleString()} words</span>
                <span>·</span>
                <span>{totalPages.toLocaleString()} pages</span>
                {book.language && (
                  <>
                    <span>·</span>
                    <span>{book.language.toUpperCase()}</span>
                  </>
                )}
              </div>
            )}

            {book.description && (
              <p className="mt-3 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">{book.description}</p>
            )}

            <div className="mt-4 flex gap-3">
              {content ? (
                <Link href={`/book/${sourceId}/${encodeURIComponent(id)}/read`} className="btn-primary" aria-label="Read this book">
                  Read
                </Link>
              ) : (
                <span className="btn-primary cursor-not-allowed opacity-50" aria-disabled="true">Read</span>
              )}
              {book.sourceUrl && (
                <a href={book.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  View on {SOURCE_LABELS[sourceId] ?? "source"} ↗
                </a>
              )}
            </div>
            {content && OCR_SOURCES.has(sourceId) && (
              <p className="mt-2 text-xs text-gray-400">Text is from a scan of the printed book, so it may contain occasional OCR errors.</p>
            )}
          </div>
        </div>

        {/* Content error banner */}
        {contentError && (
          <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <strong>Full text not available:</strong> {contentError}
          </div>
        )}

        {/* Main content grid */}
        {content && (
          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Chapters</h2>
              <div className="space-y-1" role="list" aria-label="Chapter list">
                {chapters.map((ch) => (
                  <Link
                    key={ch.index}
                    href={`/book/${sourceId}/${encodeURIComponent(id)}/read?ch=${ch.index}`}
                    role="listitem"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <span className="truncate text-gray-800 dark:text-gray-200">{ch.title}</span>
                    <span className="ml-4 shrink-0 text-xs text-gray-400">{ch.wordCount.toLocaleString()} words</span>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">✦ Summarize</h2>
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <SummarizePanel bookId={id} sourceId={sourceId as SourceId} chapters={chapters} currentChapter={0} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
