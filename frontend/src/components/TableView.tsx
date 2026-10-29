"use client";

/**
 * Table ⇄ card view for any data table.
 *
 * Wrap an existing `<table>` and it gains a "Table | Cards" switch. Card view
 * restyles the SAME rows (see `.as-cards` in globals.css) — every row becomes
 * a card, its first cell the card title, and every other cell is labelled with
 * its column header. No row markup is duplicated, so actions, badges, links
 * and inline controls behave identically in both views.
 *
 * Labels come from the table's `<thead>`; they are re-applied whenever rows
 * change (data loads, filters, pagination) via a MutationObserver.
 *
 * Each cell also gets a `data-role` that decides where it sits on the card:
 *   title   — the headline (default: first column; override with `title`)
 *   badge   — pinned top-right (default: the "Status" column)
 *   wide    — full-width field for long text (contact, description, message…)
 *   actions — footer row ("Actions" column, or an unlabelled trailing column)
 *   meta    — everything else, in a two-column label-over-value grid
 *   hidden  — dropped from the card (`hide`); `mobileHide` drops a field from phone cards only
 *
 * The choice is remembered per table (`id`) and page. Phones default to cards.
 *
 * Pages with a purpose-built card design pass it as `cards` (built from their
 * own data with components/RecordCard). The table then stays mounted but
 * hidden in card mode, so the record count and any table state survive.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@/components/ui";

type Mode = "table" | "cards";

type Hints = { title?: string; badge?: string | false; wide?: string[]; hide?: string[]; mobileHide?: string[] };

const WIDE_DEFAULT = /contact|description|message|recipient|e-?mail|question|remarks|reason|address|details|notes/i;
const same = (a: string, b?: string) => !!b && a.toLowerCase() === b.toLowerCase();

function roleFor(label: string, index: number, titleIndex: number, badgeIndex: number, hints: Hints): string {
  if (index === titleIndex) return "title";
  if (index === badgeIndex) return "badge";
  if (hints.hide?.some((h) => same(label, h))) return "hidden";
  if (!label || /^actions?$/i.test(label)) return "actions";
  if (hints.wide?.some((h) => same(label, h)) || WIDE_DEFAULT.test(label)) return "wide";
  return "meta";
}

/** Writes `data-label` + `data-role` on every body cell. Returns the record count. */
function labelCells(root: HTMLElement, hints: Hints): number {
  let records = 0;
  root.querySelectorAll("table").forEach((table) => {
    const headers: string[] = [];
    table.querySelectorAll("thead tr:first-child th").forEach((th) => {
      const span = (th as HTMLTableCellElement).colSpan || 1;
      const text = (th.textContent ?? "").replace(/\s+/g, " ").trim();
      for (let i = 0; i < span; i++) headers.push(text);
    });
    // Wide matrices (a column per day) get compact tiles on a card.
    if (headers.length > 10) table.setAttribute("data-dense", "");
    else table.removeAttribute("data-dense");
    const titleIndex = hints.title ? Math.max(0, headers.findIndex((h) => same(h, hints.title))) : 0;
    const badgeIndex = hints.badge === false
      ? -1
      : headers.findIndex((h, i) => i !== titleIndex && (hints.badge ? same(h, hints.badge) : /^status$/i.test(h)));

    table.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
      let col = 0;
      let full = false;
      Array.from((tr as HTMLTableRowElement).cells).forEach((cell) => {
        const span = cell.colSpan || 1;
        // A cell spanning the whole row is an empty state / note, not a field.
        if (headers.length > 1 && span >= headers.length) {
          cell.setAttribute("data-full", "");
          full = true;
        } else {
          cell.removeAttribute("data-full");
          const label = headers[col] ?? "";
          if (label) cell.setAttribute("data-label", label);
          else cell.removeAttribute("data-label");
          let role = roleFor(label, col, titleIndex, badgeIndex, hints);
          // Only a plain badge fits the top-right slot; a status cell with a
          // control (select, Present/Absent buttons) needs a full-width field.
          if (role === "badge" && cell.querySelector("select, input, button")) role = "wide";
          cell.setAttribute("data-role", role);
          if (hints.mobileHide?.some((h) => same(label, h))) cell.setAttribute("data-mhide", "");
          else cell.removeAttribute("data-mhide");
        }
        col += span;
      });
      if (full) tr.setAttribute("data-full-row", "");
      else tr.removeAttribute("data-full-row");
      if (!full && !tr.querySelector(".skeleton") && tr.closest("tbody")) records++;
    });
  });
  return records;
}

export function TableView({
  id = "main", title, badge, wide, hide, mobileHide, cards, mobileCards, children,
}: Hints & { id?: string; cards?: ReactNode; mobileCards?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const storageKey = `table_view:${pathname}:${id}`;
  const [mode, setMode] = useState<Mode>("table");
  const [records, setRecords] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hintsRef = useRef<Hints>({});
  hintsRef.current = { title, badge, wide, hide, mobileHide };

  // Restore the saved choice; with none saved, phones start in card view.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey); } catch { /* storage blocked */ }
    if (saved === "table" || saved === "cards") setMode(saved);
    else if (window.matchMedia("(max-width: 767px)").matches) setMode("cards");
  }, [storageKey]);

  // Keep labels in sync with the rows. Only child/text changes are observed —
  // writing data-* attributes doesn't re-trigger the observer.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRecords(labelCells(root, hintsRef.current)));
    };
    run();
    const mo = new MutationObserver(run);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  const choose = (next: Mode) => {
    setMode(next);
    try { localStorage.setItem(storageKey, next); } catch { /* storage blocked */ }
  };

  return (
    <div className="table-view">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/50 px-5 py-2.5 max-md:px-4 max-md:py-2 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-accent-500 animate-pulse" />
          <span className="text-[12px] font-medium tracking-wide text-ink-3">
            {records === null ? "" : `${records} ${records === 1 ? "record found" : "records found"}`}
          </span>
        </div>
        <div className="inline-flex rounded-xl border border-line bg-surface-2/80 p-0.5 shadow-2xs" role="group" aria-label="View as">
          {([["table", "list", "Table"], ["cards", "grid", "Cards"]] as const).map(([value, icon, label]) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => choose(value)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] max-md:min-h-10 max-md:px-3.5 max-md:text-[13px] font-semibold transition-all duration-200 ${
                  active ? "bg-white text-brand-700 shadow-xs ring-1 ring-line" : "text-ink-3 hover:text-ink hover:bg-white/40"
                }`}
              >
                <Icon name={icon} className={`h-3.5 w-3.5 ${active ? "text-accent-500" : ""}`} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Phones: a purpose-built card design for this list (desktop card mode is untouched). */}
      {mode === "cards" && mobileCards !== undefined && (
        // No padding of its own: the page column already sets the gutter, so the
        // cards sit exactly like the design (the enclosing card is `max-md:contents`).
        <div className="space-y-3 md:hidden">{mobileCards}</div>
      )}
      {mode === "cards" && cards !== undefined && (
        <AnimatePresence initial={false}>
          <motion.div
            key="cards"
            className={`bg-page p-4 ${mobileCards !== undefined ? "max-md:hidden" : ""}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {cards}
          </motion.div>
        </AnimatePresence>
      )}
      <div
        ref={ref}
        className={mode === "cards" ? (cards !== undefined ? "hidden" : `as-cards ${mobileCards !== undefined ? "max-md:hidden" : ""}`) : undefined}
      >
        {children}
      </div>
    </div>
  );
}
