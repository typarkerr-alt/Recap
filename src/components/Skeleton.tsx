import type { CSSProperties } from "react";

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function BookCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
      <Skeleton className="h-24 w-16 shrink-0 rounded" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function ReaderSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  );
}
