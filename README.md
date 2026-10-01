# Recap

A clean, minimal web app that lets you find any free book and summarize a page,
a chapter, or the whole thing with AI. Built with Next.js 15, Tailwind CSS, and
the Anthropic API.

## Features

- **Unified search** across Project Gutenberg, Open Library, and Standard Ebooks
- **File upload**: EPUB, PDF, TXT, or pasted text (for books you own)
- **Chapter parsing**: auto-detects structure from EPUB nav, HTML headings, or plain text
- **Virtual pages**: ~300 words each, across every source
- **AI summaries**: page / chapter / whole-book with map-reduce, streaming results
- **Options**: TL;DR / Short / Detailed · Prose / Bullets / Key Takeaways · Spoiler-free toggle
- **Reader**: sidebar, readable serif typography, dark mode, adjustable font size, remembers position
- **Copy / Download as Markdown** buttons on every summary
- **In-memory cache** for summaries and fetched book content (swap for Supabase later)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env.local from the example
cp .env.example .env.local
# Then edit .env.local and fill in your Anthropic API key

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Your Anthropic API key |
| `ANTHROPIC_MODEL` | ❌ | `claude-sonnet-5-5` | Which Claude model to use |
| `NEXT_PUBLIC_BASE_URL` | ❌ | `http://localhost:3000` | Base URL for server-side API calls |

## Running tests

```bash
npm test
```

Tests cover chapter parsing, HTML stripping, virtual pages, and chunking logic.

## Adding a new book source

1. Create a class in `src/lib/sources/` that implements `BookSource`:

```typescript
import type { BookSource } from './BookSource';
import type { Book, BookContent, SearchResult } from '@/types';

export class MyNewSource implements BookSource {
  readonly id = 'mysource' as const;
  readonly name = 'My New Source';

  async search(query: string, limit = 20): Promise<SearchResult[]> { /* ... */ }
  async getBook(id: string): Promise<Book> { /* ... */ }
  async getContent(id: string): Promise<BookContent> { /* ... */ }
}
```

2. Add the new source ID to the `SourceId` union in `src/types/index.ts`.
3. Register it in `src/lib/sources/index.ts`.
4. Add a CSS badge class in `src/app/globals.css` (pattern: `.source-badge-mysource`).

## Architecture

```
src/
├── types/           # Shared TypeScript interfaces
├── lib/
│   ├── sources/     # BookSource adapters (Gutenberg, Open Library, Standard Ebooks, Upload)
│   ├── parsing/     # EPUB, PDF, plain-text chapter extraction + virtual pages
│   └── summarize/   # Anthropic client, streaming summarizer, in-memory cache
└── app/
    ├── page.tsx     # Home: search + upload
    ├── book/[sourceId]/[id]/
    │   ├── page.tsx     # Book overview + chapter list + summarize sidebar
    │   └── read/        # Full reader (chapter nav, font size, position memory)
    └── api/
        ├── search/      # Unified multi-source search
        ├── book/        # Book metadata + chapter list
        ├── summarize/   # Streaming SSE summarization with cache + rate limit
        └── upload/      # EPUB/PDF/TXT processing
```

## Book sources

| Source | What it provides | Full text? |
|---|---|---|
| Project Gutenberg | 70 000+ public-domain books via [Gutendex](https://gutendex.com) | ✅ HTML or plain text |
| Open Library | Millions of titles via [Open Library API](https://openlibrary.org/developers/api) | Only freely-lendable Internet Archive scans |
| Standard Ebooks | ~600 beautifully typeset public-domain books | ✅ via their OPDS feed |
| User Upload | EPUB, PDF, TXT, or pasted text | ✅ processed server-side, never persisted |

## Caching

- **Book content** (fetched external text) — in-memory Map, max 20 books
- **Summaries** — in-memory Map, max 200 entries, keyed by book + scope + options
- Both caches reset on server restart. To persist, swap `src/lib/summarize/cache.ts`
  for a Supabase or Redis adapter that exposes the same `getCached` / `setCached` /
  `getCachedContent` / `setCachedContent` / `storeUpload` / `getUpload` interface.
