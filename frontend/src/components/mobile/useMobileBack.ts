"use client";

import { useEffect, useRef } from "react";

/**
 * Phones: a full-screen add/edit/view screen behaves like a pushed page — the hardware /
 * browser Back button closes it instead of leaving the list underneath.
 *
 * Pushes one history entry (same URL, Next's own state copied so the app router treats the
 * pop as a same-page navigation, not a reload) while `open`; a Back press calls `onClose`.
 * Closing from the UI (Cancel, Save, back arrow) pops that entry so history stays clean.
 * Desktop (>= 768px) is untouched.
 */
export function useMobileBack(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767.98px)").matches) return;

    const marker = `m-page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    window.history.pushState({ ...(window.history.state ?? {}), __mPage: marker }, "");
    let poppedByUser = false;
    const onPop = () => {
      if (window.history.state?.__mPage === marker) return; // forward again onto our entry
      poppedByUser = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed from the UI: drop our entry so Back doesn't need two presses.
      if (!poppedByUser && window.history.state?.__mPage === marker) window.history.back();
    };
  }, [open]);
}
