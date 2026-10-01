import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recap — AI Book Summaries",
  description: "Find any book from Gutenberg, Open Library, or Standard Ebooks and summarize a page, chapter, or the whole thing with AI.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>",
  },
  openGraph: {
    title: "Recap — AI Book Summaries",
    description: "Find any free book and get an instant AI summary. Choose scope, length, and format.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Recap — AI Book Summaries",
    description: "Find any free book and get an instant AI summary.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('recap-theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-white dark:bg-gray-950">{children}</body>
    </html>
  );
}
