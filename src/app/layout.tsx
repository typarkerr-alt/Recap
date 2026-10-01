import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recap — AI Book Summaries",
  description: "Find any book and summarize a page, chapter, or the whole thing with AI.",
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
