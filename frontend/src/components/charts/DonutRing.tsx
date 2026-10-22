"use client";

/**
 * SVG donut. Built by hand rather than pulling in a charting library: one ring
 * of three arcs doesn't justify a dependency tree, and an SVG stroke keeps the
 * labels as real text.
 *
 * Segments with a value of 0 are skipped entirely, so a run with no collections
 * shows one honest "nothing collected" arc instead of three misleading slices.
 */

export type DonutSegment = { label: string; value: number; color: string };

export function DonutRing({
  segments, centerLabel, centerValue, caption, showShare = false, currency = "₹", layout = "auto",
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  caption?: string;
  /** Appends each segment's share of the total, e.g. "50%". */
  showShare?: boolean;
  /** Prefix for the legend amounts; pass "" for plain counts / percentages. */
  currency?: string;
  /**
   * "auto" puts the legend beside the ring once there's room; "column" always
   * stacks it underneath. Use "column" inside a narrow card — the legend would
   * otherwise be squeezed or clipped regardless of viewport width.
   */
  layout?: "auto" | "column";
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  const visible = segments.filter((s) => s.value > 0);

  let offset = 0;
  const arcs = visible.map((s) => {
    const fraction = total > 0 ? Math.max(0, s.value) / total : 0;
    const arc = { ...s, length: fraction * C, dashOffset: -offset, fraction };
    offset += fraction * C;
    return arc;
  });

  return (
    <div
      className={
        layout === "column"
          ? "flex flex-col items-center gap-4"
          : "flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6"
      }
    >
      <div className="relative shrink-0">
        <svg viewBox="0 0 100 100" className="h-[132px] w-[132px] -rotate-90" role="img"
          aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line)" strokeWidth="11" />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="11"
              strokeLinecap="butt"
              strokeDasharray={`${a.length} ${C - a.length}`}
              strokeDashoffset={a.dashOffset}
              style={{ transition: "stroke-dasharray 0.8s var(--ease-soft)" }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="font-display text-[19px] font-extrabold leading-none tracking-tight text-ink">
            {centerValue}
          </p>
          <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
            {centerLabel}
          </p>
        </div>
      </div>

      <div className="w-full min-w-0 space-y-2.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
              <span className="truncate text-ink-2">{s.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums text-ink">
                {currency}{Math.round(s.value).toLocaleString("en-IN")}
              </span>
              {showShare && total > 0 && (
                <span className="block text-[10.5px] tabular-nums text-ink-3">
                  {Math.round((Math.max(0, s.value) / total) * 100)}%
                </span>
              )}
            </span>
          </div>
        ))}
        {caption && <p className="pt-1 text-[11.5px] leading-relaxed text-ink-3">{caption}</p>}
      </div>
    </div>
  );
}
