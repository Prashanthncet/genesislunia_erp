"use client";

/**
 * Grouped vertical bar chart.
 *
 * Hand-built from divs rather than SVG or a charting library, for three
 * practical reasons: the bars are responsive without a resize observer, every
 * value stays real selectable text (so it is readable by a screen reader and
 * copy-pasteable), and hover tooltips are plain CSS.
 *
 * A `null` value renders an explicit "no data" tick rather than a zero-height
 * bar, which would read as a genuine zero.
 */

export type BarSeries = {
  label: string;
  color: string;
  /** One entry per category; `null` means "nothing recorded". */
  values: (number | null)[];
};

/** Rounds an axis maximum up to a readable number so ticks aren't 6.32M etc. */
function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function GroupedBars({
  categories,
  series,
  formatValue = (v) => String(v),
  formatTick,
  height = 248,
  yTicks = 4,
  emptyMessage = "Nothing recorded yet.",
  ariaLabel,
}: {
  categories: string[];
  series: BarSeries[];
  /** Tooltip + value formatting. */
  formatValue?: (value: number, seriesLabel: string) => string;
  /** Axis tick formatting; defaults to `formatValue` with the first series label. */
  formatTick?: (value: number) => string;
  height?: number;
  yTicks?: number;
  emptyMessage?: string;
  ariaLabel?: string;
}) {
  const finite = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));

  if (categories.length === 0 || series.length === 0 || finite.length === 0) {
    return <p className="py-10 text-center text-[12.5px] text-ink-3">{emptyMessage}</p>;
  }

  const max = niceCeil(Math.max(...finite));
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i);
  const tickText = formatTick ?? ((v: number) => formatValue(v, series[0]?.label ?? ""));

  return (
    <div className="w-full" role="group" aria-label={ariaLabel}>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pb-3.5">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <div className="flex gap-3">
        {/* Y axis */}
        <div className="relative w-11 shrink-0" style={{ height }}>
          <div className="flex h-full flex-col justify-between">
            {ticks
              .slice()
              .reverse()
              .map((t) => (
                <span key={t} className="text-right text-[10px] font-medium leading-none tabular-nums text-ink-3">
                  {tickText(t)}
                </span>
              ))}
          </div>
        </div>

        {/* Plot area */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0" style={{ height }} aria-hidden>
            {ticks.map((t, i) => (
              <div
                key={t}
                className={`absolute inset-x-0 border-t ${i === 0 ? "border-line-strong" : "border-dashed border-line"}`}
                style={{ bottom: `${(i / yTicks) * 100}%` }}
              />
            ))}
          </div>

          <div className="relative flex items-end gap-1 sm:gap-2" style={{ height }}>
            {categories.map((cat, ci) => (
              <div key={`${cat}-${ci}`} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
                {/* Hover readout — the exact numbers for this category. */}
                <div
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 shadow-pop group-hover:block"
                  role="tooltip"
                >
                  <p className="mb-1 text-[11px] font-bold text-ink">{cat}</p>
                  {series.map((s) => {
                    const v = s.values[ci];
                    return (
                      <p key={s.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                        <span className="font-medium">{s.label}</span>
                        <span className="ml-1 font-semibold tabular-nums text-ink">
                          {v === null ? "no data" : formatValue(v, s.label)}
                        </span>
                      </p>
                    );
                  })}
                </div>

                <div className="flex h-full items-end justify-center gap-[3px]">
                  {series.map((s) => {
                    const v = s.values[ci];
                    if (v === null || !Number.isFinite(v)) {
                      return (
                        <span
                          key={s.label}
                          className="h-1 w-full max-w-[20px] rounded-sm border border-dashed border-line-strong"
                          title={`${s.label}: no data`}
                        />
                      );
                    }
                    const pct = max > 0 ? (v / max) * 100 : 0;
                    return (
                      <div
                        key={s.label}
                        className="w-full max-w-[20px] rounded-t-[4px] transition-[height,opacity] duration-500 ease-out group-hover:opacity-100"
                        style={{ height: `${Math.max(pct, v > 0 ? 1.2 : 0)}%`, background: s.color, opacity: 0.92 }}
                        title={`${cat} · ${s.label}: ${formatValue(v, s.label)}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category labels, aligned to the plot area (44px axis + 12px gap). */}
      <div className="flex gap-1 pl-14 sm:gap-2">
        {categories.map((cat, ci) => (
          <span
            key={`${cat}-${ci}`}
            className="min-w-0 flex-1 truncate text-center text-[10.5px] font-medium text-ink-3"
            title={cat}
          >
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
