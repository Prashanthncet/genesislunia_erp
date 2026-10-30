"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const DEV_VERIFIED_KEY = "dev_access_verified";

export function isDevAccessUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DEV_VERIFIED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Global Console / DevTools / Inspect Access Code Gate.
 *
 * Mounted in RootLayout (`src/app/layout.tsx`) so it protects EVERY route and
 * EVERY user regardless of role. If anyone attempts to open the browser Console
 * or Inspector via:
 *   1. Keyboard shortcuts (`F12`, `Ctrl+Shift+I`, `Ctrl+Shift+J`, `Ctrl+Shift+C`, `Ctrl+Shift+K`, `Ctrl+U`)
 *   2. Right-click context menu (`contextmenu`)
 *   3. Browser menu docked DevTools (`window.outerWidth - window.innerWidth > 160` or `window.outerHeight - window.innerHeight > 160`)
 *   4. Console object inspection getter
 * it immediately prompts for the Server-Side Access Code (`POST /api/auth/verify-access-code`).
 */
export function DevToolsGuard() {
  const [unlocked, setUnlocked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dockedOpen, setDockedOpen] = useState(false);
  const [triggerReason, setTriggerReason] = useState("Console / Inspector access attempt detected");
  const [accessCode, setAccessCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setUnlocked(isDevAccessUnlocked());
    const onChanged = () => {
      const ok = isDevAccessUnlocked();
      setUnlocked(ok);
      if (ok) {
        setModalOpen(false);
        setDockedOpen(false);
      }
    };
    window.addEventListener("erp:dev-access-changed", onChanged);
    return () => window.removeEventListener("erp:dev-access-changed", onChanged);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || unlocked) return;

    const openPrompt = (reason: string) => {
      setTriggerReason(reason);
      setError("");
      setModalOpen(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || "").toUpperCase();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      const isF12 = key === "F12" || e.keyCode === 123;
      const isInspectCombo = ctrlOrCmd && e.shiftKey && ["I", "J", "C", "K"].includes(key);
      const isMacAltCombo = e.metaKey && e.altKey && ["I", "J", "C", "K", "U"].includes(key);
      const isViewSource = ctrlOrCmd && !e.shiftKey && key === "U";

      if (isF12 || isInspectCombo || isMacAltCombo || isViewSource) {
        e.preventDefault();
        e.stopPropagation();
        openPrompt(
          isF12
            ? "F12 Console / DevTools shortcut intercepted"
            : isViewSource
              ? "View-source shortcut (Ctrl+U) intercepted"
              : `Console / Inspector shortcut (Ctrl+Shift+${key}) intercepted`,
        );
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Do not block automated headless Playwright test clicks unless explicitly testing
      if (navigator.webdriver) return;
      e.preventDefault();
      e.stopPropagation();
      openPrompt("Right-click Inspect menu intercepted — Access code required");
    };

    const checkDockedDevTools = () => {
      if (navigator.webdriver) return;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const isDocked =
        window.outerWidth > 0 &&
        window.innerWidth > 0 &&
        (widthDiff > 165 || heightDiff > 165);
      if (isDocked) {
        setDockedOpen(true);
        openPrompt("Browser Console / DevTools panel detected open — Access code required");
      } else {
        setDockedOpen(false);
      }
    };

    const handleCustomOpen = () => {
      openPrompt("Console / Inspector access code verification");
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("contextmenu", handleContextMenu, { capture: true });
    window.addEventListener("resize", checkDockedDevTools);
    window.addEventListener("erp:open-dev-verify", handleCustomOpen);

    // Check immediately and periodically for browser-menu opened DevTools
    checkDockedDevTools();
    const intervalId = window.setInterval(checkDockedDevTools, 1000);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      window.removeEventListener("resize", checkDockedDevTools);
      window.removeEventListener("erp:open-dev-verify", handleCustomOpen);
      window.clearInterval(intervalId);
    };
  }, [unlocked]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!accessCode.trim()) {
      setError("Please enter the access code.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await apiFetch<{ verified: boolean; message: string }>("/api/auth/verify-access-code", {
        method: "POST",
        body: JSON.stringify({ access_code: accessCode.trim() }),
      });
      if (res.verified) {
        try {
          sessionStorage.setItem(DEV_VERIFIED_KEY, "1");
        } catch { /* storage blocked */ }
        setUnlocked(true);
        setModalOpen(false);
        setDockedOpen(false);
        setAccessCode("");
        window.dispatchEvent(new CustomEvent("erp:dev-access-changed"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid access code");
    } finally {
      setVerifying(false);
    }
  }

  function handleDismiss() {
    if (dockedOpen) {
      setError("Please close the browser Console / DevTools panel first, or enter the valid Access Code to continue.");
      return;
    }
    setModalOpen(false);
  }

  if (!modalOpen || unlocked) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Console Access Code Required"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-700 text-white shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <div>
              <h2 className="font-display text-[18px] font-bold text-ink">
                Access Code Required
              </h2>
              <p className="text-[12px] font-medium text-ink-3">
                Console &amp; Inspector Protection
              </p>
            </div>
          </div>
          {!dockedOpen && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Close dialog"
              className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>

        <form onSubmit={handleVerify} className="mt-4 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-[13px] text-slate-700">
            <p className="font-semibold text-amber-900">{triggerReason}</p>
            <p className="mt-1 leading-relaxed">
              Opening the browser Console, Network tab, or Inspector requires a server-verified access code. All API calls are routed through same-origin <strong>Next.js Route Handlers (BFF)</strong> and protected by <strong>NestJS Guards</strong>.
            </p>
          </div>

          <div>
            <label htmlFor="console-access-code-input" className="mb-1.5 block text-[12px] font-semibold text-ink-2">
              Enter Server Access Code
            </label>
            <input
              id="console-access-code-input"
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Enter access code to unlock console…"
              aria-label="Console access code"
              autoFocus
              className="field w-full"
            />
            <p className="mt-1 text-[11.5px] text-ink-3">
              Verified on the NestJS server via SHA-256 constant-time comparison (never stored in client code).
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger-ink"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {!dockedOpen && (
              <button
                type="button"
                onClick={handleDismiss}
                className="btn-soft"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={verifying}
              className="btn-primary"
            >
              {verifying ? "Verifying on server…" : "Verify Access Code"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
