/**
 * Grade engine — pure functions, no Prisma, so it can be unit-tested and reused by
 * the report card, the class bulk generation and the Phase 7 performance report.
 *
 *  - Subject %   = sum(score / max * weight) / sum(weight) * 100   (weighted across exams)
 *  - Overall %   = mean of subject %s (each subject counts equally)
 *  - Grade       = the band with the highest minPercent <= pct
 *  - Grade point = mean of the subject grade points (CBSE CGPA style)
 *  - Rank        = competition ranking on overall % within the class (1, 2, 2, 4)
 */

export type Band = { grade: string; minPercent: number; gradePoint: number | null; remark?: string | null };

export type MarkInput = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  examId: string;
  examName: string;
  score: number;
  maxScore: number;
  weight: number;
};

export type SubjectResult = {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  exams: { exam_id: string; exam_name: string; score: number; max_score: number; weight: number; pct: number }[];
  weighted_pct: number;
  grade: string | null;
  grade_point: number | null;
  remark: string | null;
};

export type GradeSummary = {
  subjects: SubjectResult[];
  overall_pct: number | null;
  overall_grade: string | null;
  grade_point: number | null;
  remark: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Returns an error message, or null when the band set is usable:
 * at least one band, unique grade names, unique thresholds in [0, 100], a band
 * starting at 0 (so every percentage maps to a grade), and grade points that do
 * not rise as the threshold falls.
 */
export function validateBands(bands: Band[]): string | null {
  if (!Array.isArray(bands) || bands.length === 0) return 'At least one grade band is required';
  const grades = new Set<string>();
  const mins = new Set<number>();
  for (const b of bands) {
    const g = (b.grade ?? '').trim();
    if (!g) return 'Every band needs a grade name';
    if (grades.has(g.toLowerCase())) return `Duplicate grade "${g}"`;
    grades.add(g.toLowerCase());
    if (typeof b.minPercent !== 'number' || !Number.isFinite(b.minPercent) || b.minPercent < 0 || b.minPercent > 100) {
      return `Band "${g}": min_percent must be between 0 and 100`;
    }
    if (mins.has(b.minPercent)) return `Two bands start at ${b.minPercent}% — thresholds must not overlap`;
    mins.add(b.minPercent);
    if (b.gradePoint !== null && b.gradePoint !== undefined && (!Number.isFinite(b.gradePoint) || b.gradePoint < 0 || b.gradePoint > 100)) {
      return `Band "${g}": grade_point must be between 0 and 100`;
    }
  }
  if (!mins.has(0)) return 'One band must start at 0% so every score maps to a grade';
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i - 1].gradePoint;
    const lo = sorted[i].gradePoint;
    if (hi != null && lo != null && lo > hi) {
      return `Band "${sorted[i].grade}" has a higher grade point than "${sorted[i - 1].grade}"`;
    }
  }
  return null;
}

/** Band for a percentage: highest minPercent that is <= pct. Null if no bands. */
export function bandFor(pct: number, bands: Band[]): Band | null {
  let best: Band | null = null;
  for (const b of bands) {
    if (pct + 1e-9 >= b.minPercent && (!best || b.minPercent > best.minPercent)) best = b;
  }
  return best;
}

/** Weighted percentage across exams: sum(score/max*weight)/sum(weight)*100. Null when nothing counts. */
export function weightedPercent(rows: { score: number; maxScore: number; weight: number }[]): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    if (!(r.maxScore > 0) || !(r.weight > 0)) continue;
    num += (r.score / r.maxScore) * r.weight;
    den += r.weight;
  }
  return den > 0 ? (num / den) * 100 : null;
}

/** Full per-student grade summary from raw marks. */
export function summarise(marks: MarkInput[], bands: Band[]): GradeSummary {
  const bySubject = new Map<string, MarkInput[]>();
  for (const m of marks) {
    const list = bySubject.get(m.subjectId) ?? [];
    list.push(m);
    bySubject.set(m.subjectId, list);
  }
  const subjects: SubjectResult[] = [];
  for (const [subjectId, rows] of bySubject) {
    const pct = weightedPercent(rows);
    if (pct === null) continue;
    const band = bandFor(pct, bands);
    subjects.push({
      subject_id: subjectId,
      subject_name: rows[0].subjectName,
      subject_code: rows[0].subjectCode,
      exams: rows.map((r) => ({
        exam_id: r.examId,
        exam_name: r.examName,
        score: r.score,
        max_score: r.maxScore,
        weight: r.weight,
        pct: r.maxScore > 0 ? round1((r.score / r.maxScore) * 100) : 0,
      })),
      weighted_pct: round1(pct),
      grade: band?.grade ?? null,
      grade_point: band?.gradePoint ?? null,
      remark: band?.remark ?? null,
    });
  }
  subjects.sort((a, b) => a.subject_name.localeCompare(b.subject_name));

  if (subjects.length === 0) {
    return { subjects, overall_pct: null, overall_grade: null, grade_point: null, remark: null };
  }
  // Average the unrounded subject percentages so rounding never moves a band.
  const raw = [...bySubject.values()].map((rows) => weightedPercent(rows)).filter((p): p is number => p !== null);
  const overall = raw.reduce((s, p) => s + p, 0) / raw.length;
  const band = bandFor(overall, bands);
  const gps = subjects.map((s) => s.grade_point).filter((g): g is number => g !== null);
  return {
    subjects,
    overall_pct: round1(overall),
    overall_grade: band?.grade ?? null,
    grade_point: gps.length ? round2(gps.reduce((s, g) => s + g, 0) / gps.length) : null,
    remark: band?.remark ?? null,
  };
}

/** Competition ranking (1, 2, 2, 4). Entries with a null score are unranked. */
export function rankMap(entries: { id: string; pct: number | null }[]): Map<string, number> {
  const ranked = entries.filter((e): e is { id: string; pct: number } => e.pct !== null).sort((a, b) => b.pct - a.pct);
  const out = new Map<string, number>();
  ranked.forEach((e, i) => {
    const prev = ranked[i - 1];
    out.set(e.id, prev && Math.abs(prev.pct - e.pct) < 1e-9 ? (out.get(prev.id) as number) : i + 1);
  });
  return out;
}

/** Pass mark = lowest threshold whose band carries a positive grade point (CBSE "D" = 33). */
export function passThreshold(bands: Band[]): number {
  const passing = bands.filter((b) => (b.gradePoint ?? 0) > 0).map((b) => b.minPercent);
  return passing.length ? Math.min(...passing) : 33;
}
