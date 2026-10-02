import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-6xl" aria-hidden="true">📭</span>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Page not found</h1>
      <p className="max-w-sm text-gray-500">
        The book or page you&apos;re looking for doesn&apos;t exist, or the upload session has expired.
      </p>
      <Link href="/" className="btn-primary">
        ← Back to search
      </Link>
    </div>
  );
}
