"use client";

import { useEffect, useRef, useState } from "react";
import { DOWNLOAD_EVENT, type DownloadEvent } from "@/lib/api";
import { Icon } from "@/components/ui";

/**
 * Download tray: every PDF / Excel / CSV download (lib/api apiDownload) shows a card with
 * the file name, live progress and a clear finish — instead of a lone button spinner.
 * Desktop: bottom-left (toasts own bottom-right). Phones: under the app bar.
 */

type Item = DownloadEvent & { at: number };

const KIND: Record<string, { label: string; tile: string; ink: string }> = {
  pdf: { label: "PDF", tile: "bg-[#fdecec]", ink: "text-[#b42318]" },
  xlsx: { label: "XLS", tile: "bg-[#e8f6ee]", ink: "text-[#157347]" },
  xls: { label: "XLS", tile: "bg-[#e8f6ee]", ink: "text-[#157347]" },
  csv: { label: "CSV", tile: "bg-[#e7f4f6]", ink: "text-[#0e7490]" },
};
const kindOf = (name: string) => KIND[name.split(".").pop()?.toLowerCase() ?? ""] ?? { label: "FILE", tile: "bg-brand-50", ink: "text-brand-700" };

function size(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DownloadTray() {
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<DownloadEvent>).detail;
      setItems((prev) => {
        const rest = prev.filter((i) => i.id !== d.id);
        const old = prev.find((i) => i.id === d.id);
        return [...rest, { ...old, ...d, at: old?.at ?? Date.now() }].slice(-3);
      });
      if (d.phase === "done" || d.phase === "error") {
        clearTimeout(timers.current.get(d.id));
        timers.current.set(d.id, setTimeout(() => setItems((p) => p.filter((i) => i.id !== d.id)), d.phase === "done" ? 4200 : 7000));
      }
    };
    window.addEventListener(DOWNLOAD_EVENT, onEvent);
    const t = timers.current;
    return () => { window.removeEventListener(DOWNLOAD_EVENT, onEvent); t.forEach(clearTimeout); };
  }, []);

  if (!items.length) return null;
  const dismiss = (id: string) => setItems((p) => p.filter((i) => i.id !== id));

  return (
    <div
      className="pointer-events-none fixed bottom-5 left-5 z-[101] flex w-[min(92vw,22rem)] flex-col gap-2 max-lg:bottom-auto max-lg:left-4 max-lg:right-4 max-lg:top-[calc(56px+var(--m-safe-top)+0.5rem)] max-lg:w-auto"
      aria-live="polite"
      role="status"
    >
      {items.map((it) => {
        const k = kindOf(it.name);
        const pct = it.total ? Math.min(100, Math.round(((it.loaded ?? 0) / it.total) * 100)) : null;
        const done = it.phase === "done";
        const failed = it.phase === "error";
        const busy = !done && !failed;
        return (
          <div
            key={it.id}
            className="dl-card pointer-events-auto relative overflow-hidden rounded-2xl border border-line bg-surface/95 p-3.5 shadow-pop backdrop-blur-xl"
          >
            <div className="flex items-center gap-3">
              <span className={`relative grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-lg ${k.tile} ring-1 ring-black/5`}>
                {/* folded-corner document */}
                <span aria-hidden className="absolute right-0 top-0 h-3 w-3 rounded-bl-md bg-white/80 shadow-[-1px_1px_0_rgba(0,0,0,0.06)]" />
                <span className={`mt-2 text-[10.5px] font-extrabold tracking-wide ${k.ink}`}>{k.label}</span>
                {busy && <span aria-hidden className="dl-shine absolute inset-0" />}
                {done && (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-ok text-white ring-2 ring-surface">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink" title={it.name}>{it.name}</p>
                <p className={`mt-0.5 truncate text-[12px] ${failed ? "text-danger" : done ? "text-ok-ink" : "text-ink-3"}`}>
                  {failed
                    ? it.message || "Download failed"
                    : done
                      ? `Saved to your downloads${it.total ? ` · ${size(it.total)}` : ""}`
                      : it.phase === "start"
                        ? "Preparing your file…"
                        : it.total
                          ? `Downloading · ${size(it.loaded)} of ${size(it.total)}`
                          : `Downloading${it.loaded ? ` · ${size(it.loaded)}` : "…"}`}
                </p>
              </div>
              {(done || failed) ? (
                <button type="button" onClick={() => dismiss(it.id)} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 active:bg-surface-2">
                  <Icon name="x" className="h-4 w-4" />
                </button>
              ) : (
                <span className="tnum shrink-0 text-[12px] font-semibold text-ink-2">{pct !== null ? `${pct}%` : ""}</span>
              )}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              {busy && pct === null ? (
                <div className="dl-indeterminate h-full w-1/3 rounded-full bg-brand-700" />
              ) : (
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ease-out ${failed ? "bg-danger" : done ? "bg-ok" : "bg-brand-700"}`}
                  style={{ width: `${failed ? 100 : done ? 100 : pct ?? 0}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
