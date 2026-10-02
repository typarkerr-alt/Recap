"use client";

import { useState, useEffect, useRef } from "react";
import type { SummaryOptions, SummaryScope, SummarizeRequest } from "@/types";
import { postSSE } from "@/lib/sseClient";
import { SummaryResult } from "./SummaryResult";

interface ChapterRef {
  index: number;
  title: string;
}

interface Props {
  bookId: string;
  sourceId: string;
  chapters: ChapterRef[];
  currentChapter?: number;
  currentPage?: number;
  selectedText?: string;
  onClose?: () => void;
}

type Length = SummaryOptions["length"];
type Format = SummaryOptions["format"];

const LENGTH_OPTIONS: { value: Length; label: string; desc: string }[] = [
  { value: "tldr", label: "TL;DR", desc: "2-3 sentences" },
  { value: "short", label: "Short", desc: "1-2 paragraphs" },
  { value: "detailed", label: "Detailed", desc: "Comprehensive" },
];

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: "paragraph", label: "Prose" },
  { value: "bullets", label: "Bullets" },
  { value: "takeaways", label: "Takeaways" },
];

const OPTS_KEY = "recap-summary-opts";

interface SavedOpts {
  length: Length;
  format: Format;
  spoilerFree: boolean;
}

// Validates what's in localStorage — a stale/garbled value used to make every request 400
function loadOpts(): SavedOpts | null {
  try {
    const raw = JSON.parse(localStorage.getItem(OPTS_KEY) ?? "null");
    if (!raw) return null;
    return {
      length: LENGTH_OPTIONS.some((o) => o.value === raw.length) ? raw.length : "short",
      format: FORMAT_OPTIONS.some((o) => o.value === raw.format) ? raw.format : "paragraph",
      spoilerFree: raw.spoilerFree === true,
    };
  } catch {
    return null;
  }
}

function saveOpts(opts: SavedOpts) {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {}
}

function shorten(s: string, n = 60) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function SummarizePanel({
  bookId,
  sourceId,
  chapters,
  currentChapter = 0,
  currentPage,
  selectedText,
  onClose,
}: Props) {
  const [scope, setScope] = useState<SummaryScope>(selectedText ? "selection" : "chapter");
  const [chapterIndex, setChapterIndex] = useState(currentChapter);
  const [length, setLength] = useState<Length>("short");
  const [format, setFormat] = useState<Format>("paragraph");
  const [spoilerFree, setSpoilerFree] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLabel, setSummaryLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);

  // Ask-a-question feature
  const [askMode, setAskMode] = useState(false);
  const [question, setQuestion] = useState("");
  const [askStreaming, setAskStreaming] = useState(false);
  const [askText, setAskText] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const askAbortRef = useRef<AbortController | null>(null);

  // Restore saved options once. Saving happens only on user clicks — the old
  // "persist on change" effect could overwrite saved choices with defaults on mount.
  useEffect(() => {
    const saved = loadOpts();
    if (saved) {
      setLength(saved.length);
      setFormat(saved.format);
      setSpoilerFree(saved.spoilerFree);
    }
  }, []);

  function chooseLength(v: Length) {
    setLength(v);
    saveOpts({ length: v, format, spoilerFree });
  }
  function chooseFormat(v: Format) {
    setFormat(v);
    saveOpts({ length, format: v, spoilerFree });
  }
  function chooseSpoiler(v: boolean) {
    setSpoilerFree(v);
    saveOpts({ length, format, spoilerFree: v });
  }

  // Follow the reader's current chapter
  useEffect(() => {
    setChapterIndex(Math.min(Math.max(currentChapter, 0), Math.max(chapters.length - 1, 0)));
  }, [currentChapter, chapters.length]);

  // Auto-switch scope when text is selected / deselected
  useEffect(() => {
    if (selectedText) setScope("selection");
    else setScope((s) => (s === "selection" ? "chapter" : s));
  }, [selectedText]);

  // Stop any in-flight request if the panel unmounts
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      askAbortRef.current?.abort();
    };
  }, []);

  const chapterTitle = chapters[chapterIndex]?.title ?? `Chapter ${chapterIndex + 1}`;

  function describeTarget(): string {
    switch (scope) {
      case "chapter":
        return shorten(chapterTitle, 40);
      case "book":
        return "Whole book";
      case "page":
        return `Page ${currentPage}`;
      case "selection":
        return "Selection";
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
    setProgressMsg(null);
  }

  function stopAsk() {
    askAbortRef.current?.abort();
    setAskStreaming(false);
  }

  async function run() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const lengthLabel = LENGTH_OPTIONS.find((o) => o.value === length)?.label;
    const formatLabel = FORMAT_OPTIONS.find((o) => o.value === format)?.label;
    setSummaryLabel([describeTarget(), lengthLabel, formatLabel, spoilerFree ? "Spoiler-free" : ""].filter(Boolean).join(" · "));

    setStreaming(true);
    setSummaryText(null);
    setError(null);
    setProgressMsg(scope === "book" ? "Fetching the book…" : null);

    const req: SummarizeRequest = {
      bookId,
      sourceId: sourceId as SummarizeRequest["sourceId"],
      scope,
      chapterIndex: scope === "chapter" ? chapterIndex : undefined,
      pageRange: scope === "page" && currentPage ? [currentPage, currentPage] : undefined,
      text: scope === "selection" ? selectedText : undefined,
      options: { length, format, spoilerFree },
    };

    let accumulated = "";
    try {
      await postSSE("/api/summarize", req, controller.signal, (event) => {
        if (event.type === "token") {
          accumulated += event.text ?? "";
          setSummaryText(accumulated);
          setProgressMsg(null);
        } else if (event.type === "progress") {
          setProgressMsg(event.message ?? null);
        }
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (abortRef.current === controller) {
        setStreaming(false);
        setProgressMsg(null);
      }
    }
  }

  async function submitQuestion() {
    if (!question.trim()) return;

    askAbortRef.current?.abort();
    const controller = new AbortController();
    askAbortRef.current = controller;

    setAskStreaming(true);
    setAskText(null);
    setAskError(null);

    let accumulated = "";
    try {
      await postSSE("/api/ask", { bookId, sourceId, chapterIndex, question }, controller.signal, (event) => {
        if (event.type === "token") {
          accumulated += event.text ?? "";
          setAskText(accumulated);
        }
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setAskError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (askAbortRef.current === controller) setAskStreaming(false);
    }
  }

  const chapterSelect = (
    <div className="mt-2">
      <label htmlFor="chapter-select" className="sr-only">Select chapter</label>
      <select
        id="chapter-select"
        value={chapterIndex}
        onChange={(e) => setChapterIndex(Number(e.target.value))}
        className="input"
      >
        {chapters.map((ch, i) => (
          <option key={ch.index} value={i}>
            {i + 1}. {shorten(ch.title)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-4" role="dialog" aria-label="Summarize options">
      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        <button
          onClick={() => setAskMode(false)}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${!askMode ? "bg-white shadow text-gray-900 dark:bg-gray-700 dark:text-gray-100" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          Summarize
        </button>
        <button
          onClick={() => setAskMode(true)}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${askMode ? "bg-white shadow text-gray-900 dark:bg-gray-700 dark:text-gray-100" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          Ask a question
        </button>
      </div>

      {!askMode ? (
        <>
          {/* Scope */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Summarize</p>
            <div className="flex flex-wrap gap-2">
              {[
                ...(currentPage !== undefined ? [{ value: "page" as const, label: "This page" }] : []),
                { value: "chapter" as const, label: "Chapter" },
                { value: "book" as const, label: "Whole book" },
                ...(selectedText ? [{ value: "selection" as const, label: "Selection" }] : []),
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setScope(s.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    scope === s.value
                      ? "bg-accent-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                  aria-pressed={scope === s.value}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {scope === "chapter" && chapterSelect}
            {scope === "book" && (
              <p className="mt-2 text-xs text-gray-500">Long books take a minute or two the first time — the whole text is read, not just the opening.</p>
            )}
            {scope === "selection" && selectedText && (
              <p className="mt-2 line-clamp-2 text-xs italic text-gray-500">“{shorten(selectedText, 140)}”</p>
            )}
          </div>

          {/* Length */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Length</p>
            <div className="grid grid-cols-3 gap-2">
              {LENGTH_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => chooseLength(o.value)}
                  aria-pressed={length === o.value}
                  className={`flex flex-col rounded-lg border p-2 text-left transition-all ${
                    length === o.value
                      ? "border-accent-400 bg-accent-50 dark:border-accent-600 dark:bg-accent-950/30"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                  }`}
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{o.label}</span>
                  <span className="text-xs text-gray-500">{o.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Format</p>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => chooseFormat(o.value)}
                  aria-pressed={format === o.value}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    format === o.value
                      ? "bg-accent-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Spoiler toggle */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={spoilerFree}
              onChange={(e) => chooseSpoiler(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-accent-500 focus:ring-accent-500"
            />
            Spoiler-free mode
          </label>

          {/* Generate / Stop */}
          <button
            onClick={streaming ? stop : run}
            disabled={!streaming && chapters.length === 0 && scope !== "selection"}
            className={streaming ? "btn-secondary w-full" : "btn-primary w-full"}
            aria-busy={streaming}
          >
            {streaming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                Stop
              </span>
            ) : (
              "Generate Summary"
            )}
          </button>

          {progressMsg && (
            <p className="text-xs text-gray-500" role="status" aria-live="polite">{progressMsg}</p>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {summaryText && (
            <SummaryResult
              text={summaryText}
              label={summaryLabel}
              streaming={streaming}
              onClose={() => {
                setSummaryText(null);
                onClose?.();
              }}
            />
          )}
        </>
      ) : (
        /* Ask a question mode */
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Ask anything about this chapter:</p>
            {chapterSelect}
          </div>
          <div>
            <label htmlFor="question-input" className="sr-only">Your question</label>
            <textarea
              id="question-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What motivates the main character here?"
              rows={3}
              className="input w-full resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submitQuestion();
                }
              }}
            />
            <p className="mt-1 text-xs text-gray-400">Ctrl+Enter to submit</p>
          </div>

          <button
            onClick={askStreaming ? stopAsk : submitQuestion}
            disabled={!question.trim() && !askStreaming}
            className={askStreaming ? "btn-secondary w-full" : "btn-primary w-full"}
          >
            {askStreaming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                Stop
              </span>
            ) : (
              "Ask"
            )}
          </button>

          {askError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400" role="alert">
              {askError}
            </p>
          )}

          {askText && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              {askText}
              {askStreaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent-500 align-middle" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
