"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-slate-900 antialiased">
        <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            An unexpected error occurred while rendering this view. Your data is safe.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-slate-400">Ref: {error.digest}</p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
