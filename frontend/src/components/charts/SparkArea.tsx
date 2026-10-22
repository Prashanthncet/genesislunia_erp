"use client";

/**
 * Smoothed area sparkline for KPI tiles.
 *
 * Hand-built SVG rather than a charting dependency: a trend line this small is
 * one gradient-filled path. The curve is drawn with midpoint cubic beziers,
 * which stays visually honest — it never overshoots past the real data points
 * the way a naive Catmull-Rom spline can.
 *
 * `points` holding fewer than two finite values renders a flat baseline instead
 * of a misleading slope drawn from a single sample.
 */

import { useId } from "react";
import { CHART_SERIES } from "@/lib/chart";

/** Midpoint-bezier through every point; `x`/`y` are in the SVG's viewBox units. */
function smoothPath(xs: number[], ys: number[]): string {
  if (xs.length === 0) return "";
  let d = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    d += ` C ${cx.toFixed(2)} ${ys[i].toFixed(2)} ${cx.toFixed(2)} ${ys[i + 1].toFixed(2)} ${xs[i + 1].toFixed(2)} ${ys[i + 1].toFixed(2)}`;
  }
  return d;
}

export function SparkArea({
  points,
  color = CHART_SERIES[0],
  className = "",
  height = 52,
  label,
}: {
  /** Chronological values. Non-finite entries are dropped. */
  points: number[];
  color?: string;
  className?: string;
  height?: number;
  /** Accessible description, e.g. "Monthly fee collection". */
  label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const data = points.filter((p) => Number.isFinite(p));

  const W = 100;
  const H = 32;

  if (data.length < 2) {
    return (
      <div className={className} style={{ height }} aria-hidden>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          <line
            x1="0"
            y1={H - 2}
            x2={W}
            y2={H - 2}
            stroke="var(--color-line-strong)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="4 4"
          />
        </svg>
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = W / (data.length - 1);
  const xs = data.map((_, i) => i * stepX);
  // 3px breathing room top and bottom so the curve never clips its own stroke.
  const ys = data.map((v) => H - 3 - ((v - min) / span) * (H - 6));

  const line = smoothPath(xs, ys);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  return (
    <div className={className} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        <defs>
          <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${uid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastX} cy={lastY} r="2.4" fill={color} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
