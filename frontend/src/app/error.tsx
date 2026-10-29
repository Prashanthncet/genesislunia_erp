"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { BASE } from "@/lib/api";

/** One report per distinct error per page load; the backend also throttles and de-dups. */
const reported = new Set<string>();

function reportClientError(error: Error & { digest?: string }) {
  const key = `${error.name}:${error.message}:${error.digest ?? ""}`;
  if (reported.has(key)) return;
  reported.add(key);
  const payload = JSON.stringify({
    name: (error.name || "Error").slice(0, 120),
    message: (error.message || "Unknown error").slice(0, 2000),
    stack: error.stack?.slice(0, 8000),
    digest: error.digest?.slice(0, 200),
    // Path only: query strings can carry tokens (admission form links).
    url: typeof window !== "undefined" ? window.location.pathname.slice(0, 500) : undefined,
  });
  // keepalive lets the report finish even if the user navigates away immediately.
  fetch(`${BASE}/api/telemetry/client-error`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

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
    console.error("Route error:", error);
    reportClientError(error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-8 text-center" style={{ animation: "scale-in 0.4s var(--ease-spring) both" }}>
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-danger-soft text-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.2h.01" />
          </svg>
        </span>

        <h1 className="text-xl font-bold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-2">
          This page failed to load. Your data is safe — retrying usually resolves it.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-ink-3">Reference: {error.digest}</p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={reset}>Try again</Button>
          <a href="/" className="btn-soft">Back to dashboard</a>
        </div>
      </div>
    </main>
  );
}