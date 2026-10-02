"use client";

import Image from "next/image";
import Link from "next/link";
import type { SearchResult } from "@/types";
import { SOURCE_SHORT_LABELS } from "@/lib/sources/labels";

export function BookCard({ book }: { book: SearchResult }) {
  const href = `/book/${book.sourceId}/${encodeURIComponent(book.id)}`;

  return (
    <Link
      href={href}
      role="listitem"
      className="group flex gap-3 rounded-xl border border-gray-100 p-3 transition-all hover:border-accent-200 hover:shadow-md dark:border-gray-800 dark:hover:border-accent-800"
      aria-label={`${book.title} by ${book.author}`}
    >
      {/* Cover */}
      <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
        {book.coverUrl ? (
          <Image src={book.coverUrl} alt={`Cover of ${book.title}`} fill className="object-cover" sizes="64px" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-gray-300 dark:text-gray-600" aria-hidden="true">
            📖
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold text-gray-900 group-hover:text-accent-600 dark:text-gray-100 dark:group-hover:text-accent-400">
            {book.title}
          </h3>
          <span className={`source-badge source-badge-${book.sourceId} shrink-0`}>
            {SOURCE_SHORT_LABELS[book.sourceId] ?? book.sourceId}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{book.author}</p>
        {book.year && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{book.year}</p>}
        {book.description && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{book.description}</p>
        )}
      </div>
    </Link>
  );
}
