"use client";

/**
 * Labelled bar list.
 *
 * Deliberately not a charting library: for "compare N categories" the readable
 * answer is a ranked bar list, and hand-built markup lets the value be real
 * text (screen-reader friendly, copy-pasteable, no canvas) and keeps the
 * dashboard's JS payload small.
 *
 * `value` is a percentage (0–100). `null` means "no data yet" and renders an
 * explicit empty track rather than a zero-length bar pretending to be 0%.
 */

import { useReveal } from "@/components/ui";

export type BarDatum = {
  id: string;
  label: string;
  /** 0–100, or null when there is nothing recorded yet. */
  value: number | null;
  /** Small muted text after the label. */
  meta?: string;
  /** 0–100 normalisation target; defaults to the max of all values. */
  scaleTo?: number;
};

// Chart series 1–4 from the theme, in order (navy, blue, teal, sky).
const TONES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
] as const;

function BarRow({
  datum, max, index, formatValue,
}: {
  datum: BarDatum;
  max: number;
  index: number;
  formatValue?: (value: number) => string;
}) {
  // Reveal on the <li> itself — a wrapper div inside a <ul> would be invalid.
  const { ref, style } = useReveal<HTMLLIElement>(index * 55, 8);
  const pct = datum.value === null ? 0 : Math.max(0, Math.min(100, datum.value));
  const width = datum.value === null ? 0 : (pct / max) * 100;

  return (
    <li ref={ref} style={style}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink">
          {datum.label}
          {datum.meta && <span className="ml-2 font-normal text-ink-3">{datum.meta}</span>}
        </span>
        <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-ink">
          {datum.value === null
            ? <span className="font-medium text-ink-3">no data</span>
            : formatValue ? formatValue(datum.value) : `${pct.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            datum.value === null ? "bg-line-strong" : TONES[index % TONES.length]
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  );
}

export function BarList({
  data, formatValue, emptyMessage = "Nothing recorded yet.",
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <p className="px-5 py-8 text-center text-[12.5px] text-ink-3">{emptyMessage}</p>;
  }

  const max = Math.max(
    ...data.map((d) => d.scaleTo ?? d.value ?? 0),
    1,
  );

  return (
    <ul className="space-y-3.5">
      {data.map((d, i) => (
        <BarRow key={d.id} datum={d} max={max} index={i} formatValue={formatValue} />
      ))}
    </ul>
  );
}
