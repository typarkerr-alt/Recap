"use client";

interface Chapter {
  index: number;
  title: string;
  wordCount: number;
}

interface Props {
  chapters: Chapter[];
  current: number;
  onSelect: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ChapterSidebar({ chapters, current, onSelect, isOpen, onClose }: Props) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <nav
        aria-label="Chapter navigation"
        className={`fixed left-0 top-0 z-30 h-full w-72 overflow-y-auto border-r border-gray-200 bg-white py-4 transition-transform dark:border-gray-800 dark:bg-gray-950 lg:relative lg:z-auto lg:h-auto lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Chapters</h2>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-gray-400 hover:text-gray-600"
            aria-label="Close chapter list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <ul className="space-y-0.5 px-2">
          {chapters.map((ch) => (
            <li key={ch.index}>
              <button
                onClick={() => { onSelect(ch.index); onClose(); }}
                aria-current={ch.index === current ? "true" : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  ch.index === current
                    ? "bg-accent-50 text-accent-700 font-medium dark:bg-accent-950/40 dark:text-accent-400"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <span className="block truncate">{ch.title}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {ch.wordCount.toLocaleString()} words
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
