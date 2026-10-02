// Sanitize HTML from trusted sources (Gutenberg, Standard Ebooks) for safe display.
// Strips scripts, event handlers, and dangerous attributes; keeps presentational markup.
export function sanitizeHtml(html: string): string {
  return (
    html
      // Remove entire dangerous blocks with their content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
      // Remove dangerous void elements
      .replace(/<(link|meta|base)\b[^>]*>/gi, "")
      // Remove event handlers
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // Remove javascript: protocol
      .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
      .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
      // Remove all src attributes (no external resources)
      .replace(/\s+src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  );
}
