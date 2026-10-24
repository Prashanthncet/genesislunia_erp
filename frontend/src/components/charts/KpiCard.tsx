"use client";

/**
 * KPI tile with a sparkline: icon, label, hero number, month-over-month delta,
 * and the trend curve along the bottom edge.
 *
 * The delta is computed by the caller from real monthly series — never invented
 * here. When there isn't a comparable previous period the tile says so instead
 * of showing a fake "+0%".
 */

import { Icon, useReveal } from "@/components/ui";
import { SparkArea } from "@/components/charts/SparkArea";
import { CHART_SERIES, CHART_STATUS } from "@/lib/chart";

const TONES: Record<string, { chip: string; spark: string }> = {
  brand: { chip: "bg-brand-50 text-brand-700", spark: CHART_SERIES[0] },
  violet: { chip: "bg-accent-50 text-accent-700", spark: CHART_SERIES[1] },
  emerald: { chip: "bg-ok-soft text-ok-ink", spark: CHART_STATUS.ok },
  amber: { chip: "bg-warn-soft text-warn-ink", spark: CHART_STATUS.warn },
  rose: { chip: "bg-danger-soft text-danger-ink", spark: CHART_STATUS.danger },
  sky: { chip: "bg-info-soft text-info-ink", spark: CHART_SERIES[3] },
  teal: { chip: "bg-teal-50 text-teal-700", spark: CHART_SERIES[2] },
};

export type KpiDelta = {
  /** Fractional change vs the previous comparable period, e.g. 0.06 = +6%. */
  ratio: number;
  /** What it's compared against, e.g. "vs last month". */
  label: string;
};

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  spark,
  delta,
  delay = 0,
}: {
  label: string;
  /** Pre-formatted so the caller controls ₹ / % / grouping. */
  value: string;
  hint?: string;
  icon?: string;
  tone?: keyof typeof TONES;
  /** Chronological series for the sparkline. */
  spark?: number[];
  delta?: KpiDelta | null;
  delay?: number;
}) {
  const t = TONES[tone] ?? TONES.brand;
  const { ref, style } = useReveal(delay, 14);

  const up = delta ? delta.ratio >= 0 : false;
  const deltaText = delta ? `${up ? "+" : ""}${(delta.ratio * 100).toFixed(delta.ratio * 100 % 1 === 0 ? 0 : 1)}%` : null;

  return (
    <div ref={ref} style={style} className="card card-hover relative flex flex-col overflow-hidden">
      <div className="flex items-start gap-3 p-4 pb-2">
        {icon && (
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.chip}`}>
            <Icon name={icon} className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
          <p className="mt-1 font-display text-[25px] font-extrabold leading-none tracking-tight text-ink max-md:text-[22px] max-md:leading-tight max-md:[overflow-wrap:anywhere]">
            {value}
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold max-md:flex-wrap">
            {deltaText ? (
              <>
                <Icon name={up ? "trendUp" : "trendDown"} className={`h-3.5 w-3.5 ${up ? "text-ok" : "text-danger"}`} />
                <span className={up ? "text-ok" : "text-danger"}>{deltaText}</span>
                <span className="font-medium text-ink-3">{delta!.label}</span>
              </>
            ) : (
              <span className="font-medium text-ink-3">{hint ?? "No comparable prior period"}</span>
            )}
          </p>
        </div>
      </div>

      <SparkArea
        points={spark ?? []}
        color={t.spark}
        height={54}
        label={`${label} trend`}
        className="mt-auto w-full"
      />
    </div>
  );
}
