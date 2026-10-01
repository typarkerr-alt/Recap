"use client";

import { useCallback } from "react";

interface Props {
  text: string;
  streaming?: boolean;
  onClose?: () => void;
}

export function SummaryResult({ text, streaming, onClose }: Props) {
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
  }, [text]);

  const download = useCallback(() => {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "summary.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [text]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-gray-800">
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <svg className="h-3.5 w-3.5 text-accent-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          AI-generated summary — may contain errors
          {streaming && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent-500" aria-label="Generating…" />}
        </span>
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
        <p className="streaming-text whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          {text}
          {streaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent-500" aria-hidden="true" />}
        </p>
      </div>

      {/* Actions */}
      {!streaming && (
        <div className="flex gap-2 border-t border-gray-100 px-4 py-2 dark:border-gray-800">
          <button onClick={copy} className="btn-secondary text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
            Copy
          </button>
          <button onClick={download} className="btn-secondary text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            Download .md
          </button>
        </div>
      )}
    </div>
  );
}
