"use client";

import { useCallback, useState } from "react";

interface Props {
  text: string;
  /** What this summary was generated for, e.g. "Loomings · Short · Bullets" */
  label?: string;
  streaming?: boolean;
  onClose?: () => void;
}

export function SummaryResult({ text, label, streaming, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [text]);

  const download = useCallback(() => {
    const body = label ? `# ${label}\n\n${text}\n` : text;
    const blob = new Blob([body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "summary.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [text, label]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-2 dark:border-gray-800">
        <div className="min-w-0">
          {label && <p className="truncate text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</p>}
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            AI-generated — may contain errors
            {streaming && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent-500" aria-label="Generating…" />}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Dismiss summary" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          {text}
          {streaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent-500" aria-hidden="true" />}
        </p>
      </div>

      {/* Actions */}
      {!streaming && (
        <div className="flex gap-2 border-t border-gray-100 px-4 py-2 dark:border-gray-800">
          <button onClick={copy} className="btn-secondary text-xs">
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={download} className="btn-secondary text-xs">
            Download .md
          </button>
        </div>
      )}
    </div>
  );
}
