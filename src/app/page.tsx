import { SearchBox } from "@/components/SearchBox";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ThemeToggle } from "@/components/ThemeToggle";

const FEATURES = [
  {
    icon: "🏛️",
    title: "Real libraries, free to read",
    desc: "Project Gutenberg, the Library of Congress, Internet Archive, and Open Library — only books anyone can read without an account.",
  },
  {
    icon: "✦",
    title: "AI-powered summaries",
    desc: "Summarize a single page, any chapter, or the whole book with one click.",
  },
  {
    icon: "📖",
    title: "Clean reader",
    desc: "Comfortable typography, dark mode, adjustable font size, and remembered position.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">📚</span>
          <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Recap</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center px-4 pt-12 pb-24">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl">
            Understand any book, <span className="text-accent-500">instantly</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-gray-600 dark:text-gray-400">
            Search free public libraries or upload your own. Summarize a page, a chapter, or the whole book with AI.
          </p>
        </div>

        {/* Search */}
        <div className="mt-10 w-full max-w-2xl">
          <SearchBox />
        </div>

        {/* Divider */}
        <div className="mt-16 flex w-full max-w-2xl items-center gap-4">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          <span className="text-sm text-gray-400">or upload your own</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        </div>

        {/* Upload */}
        <div id="upload" className="mt-6 w-full max-w-2xl">
          <UploadDropzone />
          <p className="mt-2 text-center text-xs text-gray-400">
            Uploads are processed on the server and deleted within 24 hours. Use this for books you own.
          </p>
        </div>

        {/* Features */}
        <div className="mt-20 grid max-w-3xl gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-gray-100 p-5 dark:border-gray-800">
              <span className="text-3xl" aria-hidden="true">{f.icon}</span>
              <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">{f.title}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-100 py-4 text-center text-xs text-gray-400 dark:border-gray-800">
        Books from Project Gutenberg, the Library of Congress, Internet Archive, and Open Library. Summaries are
        AI-generated and may contain errors.
      </footer>
    </div>
  );
}
