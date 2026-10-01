"use client";

import { useState, useEffect, useRef } from "react";
import type { SummaryOptions, SummaryScope, SummarizeRequest } from "@/types";
import { SummaryResult } from "./SummaryResult";

interface Props {
  bookId: string;
  sourceId: string;
  totalChapters: number;
  currentChapter?: number;
  currentPage?: number;
  selectedText?: string;
  onClose?: () => void;
}

const LENGTH_OPTIONS: { value: SummaryOptions["length"]; label: string; desc: string }[] = [
  { value: "tldr", label: "TL;DR", desc: "2-3 sentences" },
  { value: "short", label: "Short", desc: "1-2 paragraphs" },
  { value: "detailed", label: "Detailed", desc: "Comprehensive" },
];

const FORMAT_OPTIONS: { value: SummaryOptions["format"]; label: string }[] = [
  { value: "paragraph", label: "Prose" },
  { value: "bullets", label: "Bullets" },
  { value: "takeaways", label: "Takeaways" },
];

const OPTS_KEY = "recap-summary-opts";

function loadOpts(): { length: SummaryOptions["length"]; format: SummaryOptions["format"] } {
  try {
    const raw = localStorage.getItem(OPTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { length: "short", format: "paragraph" };
}

export function SummarizePanel({
  bookId,
  sourceId,
  totalChapters,
  currentChapter = 0,
  currentPage,
  selectedText,
  onClose,
}: Props) {
  const [scope, setScope] = useState<SummaryScope>(selectedText ? "selection" : "chapter");
  const [chapterIndex, setChapterIndex] = useState(currentChapter);
  const [length, setLength] = useState<SummaryOptions["length"]>("short");
  const [format, setFormat] = useState<SummaryOptions["format"]>("paragraph");
  const [spoilerFree, setSpoilerFree] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
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

  // Load persisted options once on mount
  useEffect(() => {
    const saved = loadOpts();
    setLength(saved.length);
    setFormat(saved.format);
  }, []);

  // Persist options when they change
  useEffect(() => {
    try {
      localStorage.setItem(OPTS_KEY, JSON.stringify({ length, format }));
    } catch {}
  }, [length, format]);

  // Keep chapter index in sync when currentChapter changes
  useEffect(() => {
    setChapterIndex(currentChapter);
  }, [currentChapter]);

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
    abortRef.current = new AbortController();

    setStreaming(true);
    setSummaryText(null);
    setError(null);
    setProgressMsg(null);

    const req: SummarizeRequest = {
      bookId,
      sourceId: sourceId as SummarizeRequest["sourceId"],
      scope,
      chapterIndex: scope === "chapter" ? chapterIndex : undefined,
      pageRange: scope === "page" && currentPage ? [currentPage, currentPage] : undefined,
      text: scope === "selection" ? selectedText : undefined,
      options: { length, format, spoilerFree },
    };

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        signal: abortRef.current.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error((data as { error?: string }).error ?? "Summarization failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as { type: string; text?: string; message?: string };
            if (parsed.type === "token") {
              accumulated += parsed.text ?? "";
              setSummaryText(accumulated);
            } else if (parsed.type === "progress") {
              setProgressMsg(parsed.message ?? null);
            } else if (parsed.type === "error") {
              throw new Error(parsed.message);
            } else if (parsed.type === "done") {
              setProgressMsg(null);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setStreaming(false);
      setProgressMsg(null);
    }
  }

  async function submitQuestion() {
    if (!question.trim()) return;

    askAbortRef.current?.abort();
    askAbortRef.current = new AbortController();

    setAskStreaming(true);
    setAskText(null);
    setAskError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        signal: askAbortRef.current.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, sourceId, chapterIndex, question }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error((data as { error?: string }).error ?? "Failed to answer question");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as { type: string; text?: string; message?: string };
            if (parsed.type === "token") {
              accumulated += parsed.text ?? "";
              setAskText(accumulated);
            } else if (parsed.type === "error") {
              throw new Error(parsed.message);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setAskError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setAskStreaming(false);
    }
  }

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
                { value: "page" as const, label: "This page" },
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

            {scope === "chapter" && (
              <div className="mt-2">
                <label htmlFor="chapter-select" className="sr-only">Select chapter</label>
                <select
                  id="chapter-select"
                  value={chapterIndex}
                  onChange={(e) => setChapterIndex(Number(e.target.value))}
                  className="input"
                >
                  {Array.from({ length: totalChapters }, (_, i) => (
                    <option key={i} value={i}>Chapter {i + 1}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Length */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Length</p>
            <div className="grid grid-cols-3 gap-2">
              {LENGTH_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setLength(o.value)}
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
                  onClick={() => setFormat(o.value)}
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
              onChange={(e) => setSpoilerFree(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-accent-500 focus:ring-accent-500"
            />
            Spoiler-free mode
          </label>

          {/* Generate / Stop */}
          <div className="flex gap-2">
            <button
              onClick={streaming ? stop : run}
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
          </div>

          {progressMsg && (
            <p className="text-xs text-gray-500" role="status" aria-live="polite">{progressMsg}</p>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {summaryText && (
            <SummaryResult text={summaryText} streaming={streaming} onClose={() => { setSummaryText(null); onClose?.(); }} />
          )}
        </>
      ) : (
        /* Ask a question mode */
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ask anything about <strong>Chapter {chapterIndex + 1}</strong>.
          </p>
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
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
              {askText}
              {askStreaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent-500 align-middle" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
