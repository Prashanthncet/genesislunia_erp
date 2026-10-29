"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, Portal } from "@/components/ui";

/**
 * Phone filter pattern: the page's own filter controls move into a bottom sheet behind a
 * "Filters (n)" button. On md+ the same controls render inline exactly as before (a
 * `contents` wrapper adds no box), so desktop layout is untouched.
 *
 * The controls stay bound to the page's existing state — they still apply as they change,
 * the sheet just gives them room. Inside an Apply-style <form>, "Show results" (and any Apply
 * button / Enter inside the sheet) submits that form through the page's own onSubmit. `active` must be the page's real count of non-default
 * filters; `onClear` should be the page's existing clear/reset handler, if it has one.
 *
 *   <MobileFilters active={[status, cls].filter(Boolean).length} onClear={reset}>
 *     <Select …/> <Select …/>
 *   </MobileFilters>
 */
export function MobileFilters({
  active = 0,
  onClear,
  label = "Filters",
  children,
}: {
  active?: number;
  onClear?: () => void;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** The page's own filter <form>, if the controls live in one (Apply-style pages). */
  const pageForm = () => triggerRef.current?.closest("form") ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="btn-soft w-full justify-between md:!hidden"
      >
        <span className="inline-flex items-center gap-2">
          <Icon name="filter" className="h-4 w-4" />
          {label}
        </span>
        {active > 0 ? (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-700 px-1.5 text-[12px] font-bold text-white">
            {active}
            <span className="sr-only"> active</span>
          </span>
        ) : (
          <Icon name="chevronDown" className="h-4 w-4 text-ink-3" />
        )}
      </button>

      <div className="contents max-md:hidden">{children}</div>

      {open && (
        <Portal>
        <div className="fixed inset-0 z-[95] flex items-end md:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-brand-900/45 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          {/* Portalled to <body> (a blurred/transformed card would otherwise trap a fixed sheet),
              so the controls leave the page's <form>: this proxy form forwards any submit — an
              Apply button or Enter in a field — to the page's form and its own onSubmit. */}
          <form
            noValidate
            onSubmit={(e) => { e.preventDefault(); pageForm()?.requestSubmit(); }}
            className="relative flex max-h-[85dvh] w-full flex-col rounded-t-[24px] border-t border-line bg-surface shadow-pop animate-slide-up-sheet"
          >
            <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong" />
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <h2 className="font-display text-[17px] font-bold text-ink">{label}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close filters" className="grid h-10 w-10 place-items-center rounded-full text-ink-3 active:bg-surface-2">
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [&>*]:!w-full [&>*]:!max-w-none">
              {children}
            </div>
            <div className="flex gap-2 border-t border-line px-4 pb-[calc(0.875rem+var(--m-safe-bottom))] pt-3">
              {onClear && (
                <button type="button" className="btn-soft flex-1" onClick={onClear} disabled={active === 0}>
                  Clear all
                </button>
              )}
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => {
                  // Apply-style pages: run the page's own onSubmit (validation + apply) on close.
                  pageForm()?.requestSubmit();
                  setOpen(false);
                }}
              >
                {active > 0 ? `Show results (${active} filter${active === 1 ? "" : "s"})` : "Show results"}
              </button>
            </div>
          </form>
        </div>
        </Portal>
      )}
    </>
  );
}
