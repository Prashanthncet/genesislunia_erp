/**
 * THE attendance rule. Every attendance % in the app (student profile, student calendar,
 * register, low-attendance list, reports, report cards, TC, parent/student portal) is
 * computed here so they can never disagree again.
 *
 *   attended      = Present + Late + OD           (OD = On Duty: school-sanctioned, counts as present)
 *   counted days  = Present + Late + OD + Absent
 *   percentage    = attended / counted × 100, one decimal; null when nothing is counted
 *
 * - Leave (approved leave) is EXCLUDED from the denominator: it neither helps nor hurts.
 * - Sundays never count, whatever was recorded on them (Sunday is the weekly holiday).
 * - Anything else (e.g. a legacy 'Holiday' / 'On Leave' row) is never counted either.
 */
export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'OD', 'Leave'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDED_STATUSES: readonly string[] = ['Present', 'Late', 'OD'];
export const COUNTED_STATUSES: readonly string[] = [...ATTENDED_STATUSES, 'Absent'];

/** Short human statement of the rule, returned by the APIs so the UI legend says the same thing. */
export const ATTENDANCE_RULE =
  'Attendance % = (Present + Late + OD) ÷ (Present + Late + OD + Absent). Approved leave and Sundays are not counted.';

export function isSunday(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 0;
}

export const isAttended = (status: string) => ATTENDED_STATUSES.includes(status);

/** Whether a record on `date` with `status` is part of the denominator. */
export function isCounted(status: string, date?: string | null): boolean {
  if (date && isSunday(date)) return false;
  return COUNTED_STATUSES.includes(status);
}

export function attendancePct(attended: number, counted: number): number | null {
  return counted > 0 ? Math.round((attended / counted) * 1000) / 10 : null;
}

export type AttendanceTally = {
  present: number; late: number; od: number; absent: number; leave: number;
  /** Present + Late + OD */
  attended: number;
  /** Present + Late + OD + Absent (the denominator) */
  counted: number;
  percentage: number | null;
};

export function emptyTally(): AttendanceTally {
  return { present: 0, late: 0, od: 0, absent: 0, leave: 0, attended: 0, counted: 0, percentage: null };
}

/** Adds `n` records with this status/date to a tally (mutates and returns it). */
export function addToTally(t: AttendanceTally, status: string, date?: string | null, n = 1): AttendanceTally {
  if (date && isSunday(date)) return t;
  if (status === 'Present') t.present += n;
  else if (status === 'Late') t.late += n;
  else if (status === 'OD') t.od += n;
  else if (status === 'Absent') t.absent += n;
  else if (status === 'Leave' || status === 'On Leave') t.leave += n;
  if (isCounted(status)) t.counted += n;
  if (isAttended(status)) t.attended += n;
  t.percentage = attendancePct(t.attended, t.counted);
  return t;
}

/** Tally of rows `{status, date?, count?}` (count defaults to 1 — use it for groupBy rows). */
export function tally(rows: Iterable<{ status: string; date?: string | null; count?: number }>): AttendanceTally {
  const t = emptyTally();
  for (const r of rows) addToTally(t, r.status, r.date ?? null, r.count ?? 1);
  return t;
}
