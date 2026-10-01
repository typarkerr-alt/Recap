export default function ReadLoading() {
  return (
    <div className="flex h-screen bg-white dark:bg-gray-950 animate-pulse">
      {/* Sidebar skeleton */}
      <aside className="hidden w-64 shrink-0 border-r border-gray-100 dark:border-gray-800 lg:block p-4 space-y-2">
        <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-gray-200 dark:bg-gray-800" />
        ))}
      </aside>

      {/* Main reading area skeleton */}
      <main className="flex-1 overflow-auto px-8 py-12 max-w-2xl mx-auto space-y-4">
        <div className="h-7 w-1/2 rounded bg-gray-200 dark:bg-gray-800 mb-8" />
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className={`h-4 rounded bg-gray-200 dark:bg-gray-800 ${i % 5 === 4 ? "w-2/3" : "w-full"}`} />
        ))}
      </main>
    </div>
  );
}
