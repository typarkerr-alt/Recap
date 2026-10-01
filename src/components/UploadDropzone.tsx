"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export function UploadDropzone() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const router = useRouter();

  const upload = useCallback(
    async (file?: File, text?: string) => {
      setUploading(true);
      setError(null);
      try {
        const form = new FormData();
        if (file) form.append("file", file);
        if (text) form.append("text", text);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        router.push(`/book/upload/${data.bookId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setUploading(false);
      }
    },
    [router]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload]
  );

  return (
    <div id="upload" className="w-full max-w-2xl">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          dragging
            ? "border-accent-400 bg-accent-50 dark:border-accent-600 dark:bg-accent-950/20"
            : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50"
        }`}
        aria-label="File upload area"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-accent-500" />
            <p className="text-sm text-gray-500">Processing your book…</p>
          </div>
        ) : (
          <>
            <div className="text-4xl" aria-hidden="true">📤</div>
            <p className="mt-2 font-medium text-gray-700 dark:text-gray-300">Drop your book here</p>
            <p className="mt-1 text-sm text-gray-500">EPUB, PDF, or TXT — up to 50 MB</p>
            <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <label className="btn-primary cursor-pointer">
                Browse file
                <input
                  type="file"
                  accept=".epub,.pdf,.txt,.text"
                  onChange={onFileChange}
                  className="sr-only"
                  aria-label="Choose a file to upload"
                />
              </label>
              <button
                onClick={() => setShowPaste(!showPaste)}
                className="btn-secondary"
                aria-expanded={showPaste}
              >
                Paste text
              </button>
            </div>
          </>
        )}
      </div>

      {showPaste && !uploading && (
        <div className="mt-3">
          <label htmlFor="paste-text" className="sr-only">Paste book text</label>
          <textarea
            id="paste-text"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste the book text here (for copyrighted books you own)…"
            rows={6}
            className="input resize-y"
          />
          <button
            onClick={() => { if (pastedText.trim()) upload(undefined, pastedText.trim()); }}
            disabled={!pastedText.trim() || uploading}
            className="btn-primary mt-2"
          >
            Process text
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
