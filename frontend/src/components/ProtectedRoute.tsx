"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

/**
 * First gate for every dashboard route: redirects to /login when there's no token,
 * or to /login?expired=1 when it is expired/malformed. Runs client-side because the
 * token lives in localStorage. WHICH screens a role may open is decided after this,
 * in DashboardShell (`canAccess` from lib/nav) — and the API re-checks every request.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bail = (expired: boolean) => {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        localStorage.removeItem("branch_id");
      } catch { /* storage blocked */ }
      window.location.href = expired ? "/login?expired=1" : "/login";
    };

    let token: string | null = null;
    try { token = localStorage.getItem("token"); } catch { /* storage blocked */ }
    if (!token) return bail(false);

    try {
      const parts = token.split(".");
      if (parts.length !== 3) return bail(true);
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.exp && payload.exp * 1000 < Date.now()) return bail(true);
      setReady(true);
    } catch {
      bail(true);
    }
  }, []);

  if (!ready) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page"
        role="status"
        aria-live="polite"
      >
        <span
          className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lift"
          style={{ animation: "pulse-ring 2.4s var(--ease-soft) infinite" }}
        >
          <Icon name="shield" className="h-6 w-6" />
        </span>
        <span className="h-1 w-40 overflow-hidden rounded-full bg-line-strong">
          <span
            className="block h-full w-1/3 rounded-full bg-brand-500"
            style={{ animation: "loader-sweep 1.1s var(--ease-smooth) infinite" }}
          />
        </span>
        <p className="text-[13px] font-medium text-ink-3">Checking your session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
