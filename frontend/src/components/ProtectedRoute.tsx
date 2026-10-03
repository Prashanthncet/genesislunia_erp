"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp * 1000 < Date.now()) {
        localStorage.removeItem("token");
        router.replace("/login");
        return;
      }
      setReady(true);
    } catch {
      localStorage.removeItem("token");
      router.replace("/login");
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4" role="status" aria-live="polite">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lift"
          style={{ animation: "pulse-ring 2.4s var(--ease-out-soft) infinite" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
            <path d="M12 3 5 6v5.5c0 4.3 2.9 8.1 7 9.5 4.1-1.4 7-5.2 7-9.5V6l-7-3Z" />
          </svg>
        </span>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/3 rounded-full bg-brand-500" style={{ animation: "slide-right 1.1s var(--ease-out-soft) infinite" }} />
        </div>
        <p className="text-sm font-medium text-slate-500">Checking your session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
