"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChapterSidebar } from "./ChapterSidebar";
import { SummarizePanel } from "./SummarizePanel";

interface Chapter {
  index: number;
  title: string;
  wordCount: number;
}

type ChapterData = { content: string; html?: string | null };

interface Props {
  bookId: string;
  sourceId: string;
  title: string;
  chapters: Chapter[];
  getChapterContent: (index: number) => Promise<ChapterData>;
  initialChapter?: number;
  contentError?: string | null;
}

const FONT_SIZES = [14, 16, 18, 20, 24];
const STORAGE_KEY_PREFIX = "recap-reader";

export function BookReader({ bookId, sourceId, title, chapters, getChapterContent, initialChapter, contentError }: Props) {
  const storageKey = `${STORAGE_KEY_PREFIX}-${bookId}`;

  const [chapterIndex, setChapterIndex] = useState(() => {
    if (initialChapter !== undefined) return initialChapter;
    try { return Number(localStorage.getItem(`${storageKey}-ch`) ?? 0); } catch { return 0; }
  });
  const [fontSizeIndex, setFontSizeIndex] = useState(() => {
    try { return Number(localStorage.getItem(`${storageKey}-fs`) ?? 1); } catch { return 1; }
  });
  const [chapterData, setChapterData] = useState<ChapterData>({ content: "" });
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  const [linkCopied, setLinkCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const fontSize = FONT_SIZES[fontSizeIndex] ?? 18;

  const mainRef = useRef<HTMLElement>(null);

  // Load chapter content and scroll to top
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setChapterData({ content: "" });
    mainRef.current?.scrollTo({ top: 0 });

    getChapterContent(chapterIndex)
      .then((data) => { if (!cancelled) { setChapterData(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setChapterData({ content: "Failed to load chapter." }); setLoading(false); } });

    return () => { cancelled = true; };
  }, [chapterIndex, getChapterContent]);

  // Save position
  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}-ch`, String(chapterIndex));
      localStorage.setItem(`${storageKey}-fs`, String(fontSizeIndex));
    } catch {}
  }, [chapterIndex, fontSizeIndex, storageKey]);

  // Keyboard shortcuts: [ = prev chapter, ] = next chapter, s = summarize, t = sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "[":
          setChapterIndex((i) => Math.max(0, i - 1));
          break;
        case "]":
          setChapterIndex((i) => Math.min(chapters.length - 1, i + 1));
          break;
        case "s":
          setSummarizeOpen((o) => !o);
          break;
        case "t":
          setSidebarOpen((o) => !o);
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chapters.length]);

  // Text selection for "summarize selection"
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()?.toString().trim();
    setSelectedText(sel && sel.length > 20 ? sel : undefined);
  }, []);

  function copyChapterLink() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("ch", String(chapterIndex));
      navigator.clipboard.writeText(url.toString());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {}
  }

  const chapter = chapters[chapterIndex];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-950">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open chapter list (T)"
          title="Chapters (T)"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          {chapter && <p className="truncate text-xs text-gray-500">{chapter.title}</p>}
        </div>

        {/* Copy chapter link */}
        <button
          onClick={copyChapterLink}
          aria-label="Copy link to this chapter"
          title="Copy chapter link"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {linkCopied ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v-2H8v2z" />
            </svg>
          )}
        </button>

        {/* Font size controls */}
        <div className="flex items-center gap-1" role="group" aria-label="Font size">
          <button
            onClick={() => setFontSizeIndex((i) => Math.max(0, i - 1))}
            disabled={fontSizeIndex === 0}
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
            aria-label="Decrease font size"
          >
            A−
          </button>
          <button
            onClick={() => setFontSizeIndex((i) => Math.min(FONT_SIZES.length - 1, i + 1))}
            disabled={fontSizeIndex === FONT_SIZES.length - 1}
            className="rounded px-2 py-1 text-base text-gray-700 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Increase font size"
          >
            A+
          </button>
        </div>

        {/* Summarize button */}
        <button
          onClick={() => setSummarizeOpen(!summarizeOpen)}
          aria-expanded={summarizeOpen}
          aria-label="Toggle summarize panel (S)"
          title="Summarize (S)"
          className="btn-primary"
        >
          ✦ Summarize
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Chapter sidebar */}
        <ChapterSidebar
          chapters={chapters}
          current={chapterIndex}
          onSelect={setChapterIndex}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Reading area */}
        <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:px-16" aria-label="Book content">
          <div className="mx-auto max-w-2xl">
            {contentError && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <strong>Full text unavailable:</strong> {contentError}
              </div>
            )}
            {loading ? (
              <div className="space-y-3" aria-label="Loading…">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
                    style={{ width: `${60 + (i % 5) * 8}%` }}
                  />
                ))}
              </div>
            ) : (
              <div
                ref={contentRef}
                onMouseUp={handleMouseUp}
                className="reader-content text-gray-900 dark:text-gray-100"
                style={{ fontSize }}
              >
                {chapter && (
                  <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">{chapter.title}</h2>
                )}
                {chapterData.html ? (
                  // Sanitized HTML from Gutenberg/Standard Ebooks — use prose renderer
                  <div
                    className="prose prose-gray max-w-none dark:prose-invert leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: chapterData.html }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed">{chapterData.content}</div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Summarize panel (slide-in from right) */}
        {summarizeOpen && (
          <aside
            className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
            aria-label="Summarize panel"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Summarize</h2>
              <button
                onClick={() => setSummarizeOpen(false)}
                aria-label="Close summarize panel"
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <SummarizePanel
              bookId={bookId}
              sourceId={sourceId}
              totalChapters={chapters.length}
              currentChapter={chapterIndex}
              selectedText={selectedText}
              onClose={() => setSummarizeOpen(false)}
            />
          </aside>
        )}
      </div>

      {/* Chapter navigation footer */}
      <footer className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-950">
        <button
          onClick={() => setChapterIndex((i) => Math.max(0, i - 1))}
          disabled={chapterIndex === 0}
          className="btn-secondary disabled:opacity-30"
          aria-label="Previous chapter ([)"
          title="Previous chapter ([)"
        >
          ← Prev
        </button>
        <span className="text-xs text-gray-500">
          Ch {chapterIndex + 1} / {chapters.length}
        </span>
        <button
          onClick={() => setChapterIndex((i) => Math.min(chapters.length - 1, i + 1))}
          disabled={chapterIndex === chapters.length - 1}
          className="btn-secondary disabled:opacity-30"
          aria-label="Next chapter (])"
          title="Next chapter (])"
        >
          Next →
        </button>
      </footer>
    </div>
  );
}
