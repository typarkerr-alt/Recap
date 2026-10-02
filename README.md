# Recap

Find a free book from a real public library and summarize a page, a chapter, or the
whole thing with AI. Built with Next.js 15, Tailwind CSS, and the Anthropic API.

## Where the books come from

Only sources that let **anyone read the full text for free, with no account**:

| Source | What it provides | Text quality |
|---|---|---|
| Project Gutenberg (via Gutendex) | 75,000+ public-domain books | Proofread — best |
| Library of Congress | 150,000+ "Selected Digitized Books" (public domain) | OCR from scans |
| Internet Archive | Millions of scanned books — lending-only items are filtered out | OCR from scans |
| Open Library | Books marked "free to read" (`ebook_access:public`); text comes from Gutenberg or Internet Archive | Varies |
| DPLA (optional) | Search across 50M+ US library records; results are routed to the library above that holds the text | — |
| Your upload | EPUB, PDF, TXT, or pasted text (max 4 MB) | — |

DPLA doesn't host books, so it's a search index only. Results pointing at sites without an
open full-text API (e.g. HathiTrust) are skipped. Standard Ebooks was removed — its catalog
feeds now require a paid membership.

## Setup

```bash
npm install
cp .env.example .env.local   # add your Anthropic key
npm run dev
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Anthropic API key (no quotes) |
| `ANTHROPIC_MODEL` | — | Defaults to `claude-sonnet-5-5` |
| `DPLA_API_KEY` | — | Enables DPLA search. Free: `curl -X POST https://api.dp.la/v2/api_key/you@example.com` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Recommended on Vercel | Set automatically by Vercel → Storage → Upstash for Redis. Shares caches and uploads across serverless instances. |

## Notes for Vercel

- Enable **Fluid compute** so whole-book summaries can run up to 300 seconds.
- The Library of Congress API allows ~20 requests/minute and blocks an IP for an hour if
  exceeded. The app budgets 10/minute per instance, caches searches on the CDN, and backs
  off automatically if LOC pushes back.

## Tests

```bash
npm test
```

## Adding a source

Implement `BookSource` (`search`, `getBook`, `getContent`) in `src/lib/sources/`, add its id
to `SourceId` / `VALID_SOURCE_IDS` in `src/types/index.ts`, register it in
`src/lib/sources/index.ts`, add a label in `src/lib/sources/labels.ts`, and a badge class
(`.source-badge-<id>`) in `src/app/globals.css`.
