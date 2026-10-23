"use client";

import { CHART_SERIES, CHART_STATUS } from "@/lib/chart";

/**
 * Grid of radial progress rings — one per class.
 *
 * Colour is semantic (a banded scale), not a rotating palette, so the same
 * colour always means the same thing and the legend can actually explain it.
 *
 * A `null` value draws an empty track reading "no data", never a 0% ring —
 * a 0% ring would claim the class was absent for every roll call.
 */

export type RingDatum = {
  id: string;
  label: string;
  /** 0–100, or null when nothing has been marked yet. */
  value: number | null;
  /** Small caption under the label, e.g. "122 / 148". */
  caption?: string;
};

/** Banded scale, shared with the legend so the two can never disagree. */
const BANDS = [
  { min: 90, color: CHART_STATUS.ok, name: "90%+" },
  { min: 80, color: CHART_SERIES[1], name: "80–89%" },
  { min: 70, color: CHART_STATUS.warn, name: "70–79%" },
  { min: -1, color: CHART_STATUS.danger, name: "below 70%" },
];

function bandFor(value: number) {
  return BANDS.find((b) => value >= b.min) ?? BANDS[BANDS.length - 1];
}

function Ring({ datum, index }: { datum: RingDatum; index: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const value = datum.value;
  const band = value === null ? null : bandFor(value);
  const dash = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * C;

  return (
    <li
      // `min-w-0` is required: a grid item defaults to min-width:auto, which
      // would stop the label from truncating and let it collide with its neighbour.
      className="flex min-w-0 flex-col items-center gap-2.5"
      style={{ animation: `fade-in 0.45s var(--ease-soft) ${index * 45}ms both` }}
    >
      <div className="relative">
        <svg viewBox="0 0 100 100" className="h-[86px] w-[86px] -rotate-90" role="img"
          aria-label={`${datum.label}: ${value === null ? "no data" : `${value}%`}`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line)" strokeWidth="9" />
          {value !== null && (
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={band!.color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C - dash}`}
              style={{ transition: "stroke-dasharray 0.9s var(--ease-soft)" }}
            />
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center">
          <span className="font-display text-[10.5px] font-bold tabular-nums leading-none text-ink">
            {value === null ? "—" : `${value}%`}
          </span>
        </div>
      </div>

      {/* Fixed min-height keeps the rows aligned whether a label needs one line
          or two. Wrapping beats truncating here — "Class 12 · Science" is the
          actual name and cutting it to "Class 12 · Sci…" helps nobody. */}
      <div className="w-full min-w-0 text-center">
        <p className="line-clamp-2 min-h-[2.3rem] text-[11.5px] font-bold leading-snug text-ink" title={datum.label}>
          {datum.label}
        </p>
        {datum.caption && (
          <p className="mt-0.5 text-[10.5px] tabular-nums text-ink-3">{datum.caption}</p>
        )}
      </div>
    </li>
  );
}

export function RingGrid({
  data,
  emptyMessage = "Nothing recorded yet.",
  showLegend = true,
}: {
  data: RingDatum[];
  emptyMessage?: string;
  showLegend?: boolean;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-[12.5px] text-ink-3">{emptyMessage}</p>;
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
        {data.map((d, i) => (
          <Ring key={d.id} datum={d} index={i} />
        ))}
      </ul>

      {showLegend && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3.5">
          {BANDS.map((b) => (
            <span key={b.name} className="flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} aria-hidden />
              {b.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
