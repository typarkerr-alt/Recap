import type { Metadata } from "next";
import "./globals.css";

const DESCRIPTION =
  "Read free books from Project Gutenberg, the Library of Congress, Internet Archive, and Open Library, and summarize a page, chapter, or the whole thing with AI.";

export const metadata: Metadata = {
  title: "Recap — AI Book Summaries",
  description: DESCRIPTION,
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>",
  },
  openGraph: { title: "Recap — AI Book Summaries", description: DESCRIPTION, type: "website" },
  twitter: { card: "summary", title: "Recap — AI Book Summaries", description: DESCRIPTION },
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
