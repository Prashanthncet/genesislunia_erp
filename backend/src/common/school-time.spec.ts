import { parseSchoolTime } from './school-time';

describe('parseSchoolTime', () => {
  it('reads zone-less times as school-local (IST is UTC+05:30), wherever the server runs', () => {
    expect(parseSchoolTime('2026-10-20T09:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-20T03:30:00.000Z');
    expect(parseSchoolTime('2026-10-20T09:00:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-20T03:30:00.000Z');
  });
  it('respects an explicit zone', () => {
    expect(parseSchoolTime('2026-10-20T09:00:00.000Z').toISOString()).toBe('2026-10-20T09:00:00.000Z');
    expect(parseSchoolTime('2026-10-20T09:00+05:30').toISOString()).toBe('2026-10-20T03:30:00.000Z');
  });
  it('handles DST zones', () => {
    expect(parseSchoolTime('2026-07-01T09:00', 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(parseSchoolTime('2026-01-15T09:00', 'Europe/London').toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });
  it('invalid input gives an invalid date', () => {
    expect(Number.isNaN(parseSchoolTime('not a date').getTime())).toBe(true);
  });
});
