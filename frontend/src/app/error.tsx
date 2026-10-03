"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Route-level error boundary. Next renders this instead of the page when a render
 * throws, so a single bad payload shows a recoverable panel with Retry rather
 * than a blank screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with real error reporting (Sentry etc.) in production.
    console.error("Route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-8 text-center" style={{ animation: "scale-in 0.4s var(--ease-spring) both" }}>
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.2h.01" />
          </svg>
        </span>

        <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">
          This page failed to load. Your data is safe — retrying usually resolves it.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-slate-400">Reference: {error.digest}</p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={reset}>Try again</Button>
          <a href="/" className="btn-soft">Back to dashboard</a>
        </div>
      </div>
    </main>
  );
}