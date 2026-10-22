/**
 * The only colours a chart may use. Series take them in this order, so the
 * same position means the same colour on every screen. Values are CSS
 * variables from `globals.css`, so they work as SVG `stroke`/`fill` and in
 * inline `background` styles alike.
 */
export const CHART_SERIES = [
  "var(--color-chart-1)", // navy  #142B4A
  "var(--color-chart-2)", // blue  #3B82F6
  "var(--color-chart-3)", // teal  #0D9488
  "var(--color-chart-4)", // sky   #38BDF8
  "var(--color-chart-5)", // gold  #D4A72C
] as const;

/** Status colours, for charts whose series *mean* good / caution / bad. */
export const CHART_STATUS = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
} as const;
