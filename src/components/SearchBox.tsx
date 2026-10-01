"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/types";
import { BookCard } from "./BookCard";
import { BookCardSkeleton } from "./Skeleton";

const CLASSICS = [
  { title: "Pride and Prejudice", query: "Pride and Prejudice Austen" },
  { title: "Frankenstein", query: "Frankenstein Shelley" },
  { title: "Moby Dick", query: "Moby Dick Melville" },
  { title: "The Great Gatsby", query: "Great Gatsby Fitzgerald" },
  { title: "1984", query: "1984 Orwell" },
  { title: "Jane Eyre", query: "Jane Eyre Bronte" },
];

const INITIAL_LIMIT = 10;
const MORE_LIMIT = 20;

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, startLoadMore] = useTransition();
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef("");
  const router = useRouter();

  function runSearch(q: string, lim = INITIAL_LIMIT) {
    if (q.length < 2) {
      setResults(null);
      setError(null);
      setHasMore(false);
      return;
    }
    lastQueryRef.current = q;

    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${lim}`);
        const data = await res.json() as { results?: SearchResult[]; error?: string };
        if (!res.ok) throw new Error(data.error);
        const items = data.results ?? [];
        setResults(items);
        setLimit(lim);
        // Show "load more" if we got a full page back from any source
        setHasMore(items.length >= lim);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
        setHasMore(false);
      }
    });
  }

  function loadMore() {
    const nextLimit = limit + MORE_LIMIT;
    const q = lastQueryRef.current;
    startLoadMore(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${nextLimit}`);
        const data = await res.json() as { results?: SearchResult[]; error?: string };
        if (!res.ok) throw new Error(data.error);
        const items = data.results ?? [];
        setResults(items);
        setLimit(nextLimit);
        setHasMore(items.length >= nextLimit);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load more");
      }
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 400);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query);
  }

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={handleSubmit} role="search">
        <div className="relative flex items-center">
          <svg
            className="absolute left-4 h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={handleChange}
            placeholder="Search for a book or author…"
            aria-label="Search for a book"
            className="w-full rounded-2xl border-2 border-gray-200 bg-white py-4 pl-12 pr-4 text-lg shadow-md placeholder:text-gray-400 focus:border-accent-500 focus:outline-none focus:ring-4 focus:ring-accent-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-accent-500"
          />
          {isPending && (
            <div className="absolute right-4 h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-accent-500" aria-label="Searching…" />
          )}
        </div>
      </form>

      {/* Quick-access classics */}
      {!results && !isPending && (
        <div className="mt-4 flex flex-wrap gap-2">
          {CLASSICS.map((c) => (
            <button
              key={c.title}
              onClick={() => {
                setQuery(c.query);
                runSearch(c.query);
              }}
              className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-600 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-accent-500 dark:hover:text-accent-400"
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {isPending && (
        <div className="mt-6 space-y-3" aria-label="Loading results">
          {Array.from({ length: 4 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-500" role="alert">{error}</p>
      )}

      {results && !isPending && results.length === 0 && (
        <p className="mt-6 text-center text-gray-500">
          No results found. Try a different search or{" "}
          <button onClick={() => router.push("#upload")} className="text-accent-500 hover:underline">
            upload a file
          </button>
          .
        </p>
      )}

      {results && !isPending && results.length > 0 && (
        <>
          <div className="mt-6 space-y-3" role="list" aria-label="Search results">
            {results.map((book) => (
              <BookCard key={`${book.sourceId}-${book.id}`} book={book} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="btn-secondary"
              >
                {isLoadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    Loading…
                  </span>
                ) : (
                  "Load more results"
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
