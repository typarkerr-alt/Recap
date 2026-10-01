"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-6xl" aria-hidden="true">⚠️</span>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Something went wrong</h2>
      <p className="max-w-sm text-sm text-gray-500">{error.message || "An unexpected error occurred."}</p>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <a href="/" className="btn-secondary">
          Go home
        </a>
      </div>
    </div>
  );
}
