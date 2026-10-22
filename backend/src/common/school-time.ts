/**
 * Times typed without a zone ("2026-10-20T09:00", from a datetime-local input or old data)
 * mean the SCHOOL's wall clock, not the server's: a container runs in UTC, so reading
 * "09:00" as server-local would open a 9 am IST test at 2:30 pm IST.
 * TZ_SCHOOL (default Asia/Kolkata) names the school's IANA timezone.
 */
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Offset of `timeZone` from UTC at instant `utcMs`, in ms (DST-aware via Intl). */
function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs;
}

/** Parses an ISO-ish timestamp; zone-less values are read as school-local time. */
export function parseSchoolTime(value: string, timeZone = process.env.TZ_SCHOOL || 'Asia/Kolkata'): Date {
  const v = value.trim();
  if (HAS_ZONE.test(v)) return new Date(v);
  const asUtc = Date.parse(`${v.length === 16 ? `${v}:00` : v}Z`);
  if (Number.isNaN(asUtc)) return new Date(NaN);
  // Two passes settle the offset across a DST boundary.
  let t = asUtc - tzOffsetMs(timeZone, asUtc);
  t = asUtc - tzOffsetMs(timeZone, t);
  return new Date(t);
}
