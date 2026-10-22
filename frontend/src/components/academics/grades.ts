/** Grade bands come from the school's configured scale (GET /api/exams/grade-bands) — never hardcoded. */
export type GradeBand = { id?: string; grade: string; minPercent: number; gradePoint: number | null; remark: string | null };

export function bandFor(pct: number | null | undefined, bands: GradeBand[]): GradeBand | null {
  if (pct === null || pct === undefined) return null;
  let best: GradeBand | null = null;
  for (const b of bands) if (pct + 1e-9 >= b.minPercent && (!best || b.minPercent > best.minPercent)) best = b;
  return best;
}

/** Badge tone by position in the scale: top third ok, middle warn, bottom danger. */
export function gradeTone(grade: string | null | undefined, bands: GradeBand[]): "emerald" | "sky" | "amber" | "rose" | "slate" {
  if (!grade) return "slate";
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  const i = sorted.findIndex((b) => b.grade === grade);
  if (i < 0) return "slate";
  const r = sorted.length > 1 ? i / (sorted.length - 1) : 0;
  return r <= 0.25 ? "emerald" : r <= 0.5 ? "sky" : r <= 0.8 ? "amber" : "rose";
}
