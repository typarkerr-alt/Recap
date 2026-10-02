export default function BookLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">📚</span>
          <span className="font-bold text-gray-900 dark:text-gray-100">Recap</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex gap-6 animate-pulse">
          <div className="hidden h-48 w-32 shrink-0 rounded-lg bg-gray-200 dark:bg-gray-800 sm:block" />
          <div className="flex-1 space-y-3">
            <div className="h-8 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="mt-4 flex gap-3">
              <div className="h-9 w-20 rounded-full bg-gray-200 dark:bg-gray-800" />
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-3 animate-pulse">
          <div className="lg:col-span-2 space-y-2">
            <div className="h-5 w-24 rounded bg-gray-200 dark:bg-gray-800 mb-4" />
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex justify-between px-3 py-2">
                <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
                <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-800" />
              </div>
            ))}
          </div>
          <div>
            <div className="h-5 w-28 rounded bg-gray-200 dark:bg-gray-800 mb-4" />
            <div className="h-64 rounded-xl bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
      </main>
    </div>
  );
}
