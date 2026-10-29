"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Icon, Portal } from "@/components/ui";
import { navFor, quickActionsFor, type NavItem } from "@/lib/nav";

type Entry = NavItem & { category: "Navigate" | "Action" };

/**
 * Ctrl/⌘+K command palette. Arrow keys move, Enter runs, Escape closes.
 * Only lists screens and actions `role` may open (same rule as the sidebar).
 */
/** `compact` renders an icon-only trigger (mobile app bar); the palette itself is the same. */
export function CommandPalette({ role, placeholder, compact = false }: { role: string | null | undefined; placeholder?: string; compact?: boolean }) {
  const ENTRIES: Entry[] = useMemo(() => {
    const seen = new Set<string>();
    const nav = navFor(role).flatMap((g) => g.items).filter((i) => !seen.has(i.href) && seen.add(i.href));
    return [
      ...nav.map((i) => ({ ...i, category: "Navigate" as const })),
      ...quickActionsFor(role).map((i) => ({ ...i, category: "Action" as const })),
    ];
  }, [role]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        // The shell mounts two palettes (desktop header + mobile bar); only the
        // visible one answers the shortcut, or Ctrl+K opened two stacked dialogs.
        if (!triggerRef.current || triggerRef.current.offsetParent === null) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    setQuery("");
    setSelected(0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTRIES;
    return ENTRIES.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.hint ?? "").toLowerCase().includes(q),
    );
  }, [query, ENTRIES]);

  useEffect(() => {
    setSelected((prev) => (prev >= filtered.length ? 0 : prev));
  }, [filtered.length]);

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    router.push(entry.href);
    setOpen(false);
  };

  return (
    <>
      {compact ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search screens and actions"
          className="grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors active:bg-surface-2"
        >
          <Icon name="search" className="h-5 w-5" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-keyshortcuts="Control+K Meta+K"
          className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-xl border border-line-strong bg-surface-2 px-3.5 text-left transition-all duration-200 hover:border-brand-300 hover:bg-surface"
        >
          <Icon name="search" className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand-500" />
          <span className="flex-1 truncate text-[13px] text-ink-3">
            {placeholder ?? "Jump to a screen or action…"}
          </span>
          <kbd className="hidden shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px] font-bold text-ink-3 sm:inline-block">
            Ctrl K
          </kbd>
        </button>
      )}

      {/* Portalled: the header's backdrop-blur would otherwise clip this overlay to the header strip. */}
      <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-[12vh]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-navy-950/50 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -16 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
            >
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Icon name="search" className="h-4.5 w-4.5 shrink-0 text-ink-3" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setSelected((p) => (filtered.length ? (p + 1) % filtered.length : 0));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setSelected((p) => (filtered.length ? (p - 1 + filtered.length) % filtered.length : 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      run(filtered[selected]);
                    }
                  }}
                  placeholder="Type a screen or action…"
                  aria-label="Search commands"
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink-3 transition-colors hover:text-ink"
                >
                  ESC
                </button>
              </div>

              <div className="scroll-slim max-h-[52vh] overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[13px] font-semibold text-ink">No matches</p>
                    <p className="mt-1 text-[12px] text-ink-3">
                      Nothing matched &ldquo;{query}&rdquo;. Try a module name.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filtered.map((entry, index) => {
                      const isSelected = index === selected;
                      return (
                        <button
                          key={`${entry.category}-${entry.name}-${index}`}
                          type="button"
                          onClick={() => run(entry)}
                          onMouseEnter={() => setSelected(index)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100 ${
                            isSelected ? "bg-brand-50" : "hover:bg-surface-2"
                          }`}
                        >
                          <span
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                              isSelected ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-2"
                            }`}
                          >
                            <Icon name={entry.icon} className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-ink">
                              {entry.name}
                            </span>
                            {entry.hint && (
                              <span className="block truncate text-[11px] text-ink-3">{entry.hint}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-3">
                            {entry.category}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2 text-[11px] text-ink-3">
                <span className="flex items-center gap-3">
                  <span>↑ ↓ to navigate</span>
                  <span aria-hidden>·</span>
                  <span>↵ to select</span>
                </span>
                <span className="font-semibold">Genesis Lumia Search</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </Portal>
    </>
  );
}
