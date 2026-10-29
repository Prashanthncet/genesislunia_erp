/**
 * Payroll rules, kept pure so they can be reasoned about (and unit-tested) apart from Nest.
 *
 * UNPAID-DAY RULE (documented for HR):
 *  - Annual quotas per leave type, per calendar year: Casual 12, Sick 8, Earned 15, Duty 10,
 *    Unpaid 0 (same table as GET /balances in the leaves module).
 *  - Every Approved leave day of a quota'd type counts against that year's quota in date
 *    order. Days beyond the quota are UNPAID, and are docked in the month they fall in.
 *    Because Unpaid has a quota of 0, every approved Unpaid day is docked.
 *  - Overlapping leaves of the same type count each calendar day once.
 *  - Types outside the table (e.g. Maternity, special duty) are paid special leave and never
 *    docked automatically — HR can still enter days by hand.
 *  - Calendar days, inclusive (weekends inside a leave count), matching the balances screen.
 *  - Deduction = basic / 30 per unpaid day, capped at the basic salary.
 *  - An explicit `unpaid_leave_days[staffId]` in the generate request overrides the derived
 *    figure for that one staff member.
 */
import { LEAVE_QUOTAS } from '../common/leave-quotas';
import { epfContribution, FY2025_26, monthlyTds, PayrollRules, professionalTax, TaxMode, TaxRegime } from './payroll-tax';
export { LEAVE_QUOTAS };

export type LeaveRow = { staffId: string; leaveType: string; startDate: string; endDate: string };
export type UnpaidResult = { days: number; byType: Record<string, number> };

const DAY = 86_400_000;

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e)) return out;
  for (let t = s; t <= e && out.length < 400; t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { year: y, start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}`, days: last };
}

/** Unpaid days per staff for `month`, from approved leaves of that calendar year. */
export function deriveUnpaidDays(month: string, approvedLeaves: LeaveRow[], quotas = LEAVE_QUOTAS): Record<string, UnpaidResult> {
  const { year, start, end } = monthBounds(month);
  const yearStart = `${year}-01-01`;
  const days = new Map<string, Map<string, Set<string>>>(); // staff -> type -> dates
  for (const l of approvedLeaves) {
    if (!(l.leaveType in quotas)) continue;
    const s = l.startDate < yearStart ? yearStart : l.startDate;
    const e = l.endDate > end ? end : l.endDate;
    if (s > e) continue;
    const byType = days.get(l.staffId) ?? new Map<string, Set<string>>();
    const set = byType.get(l.leaveType) ?? new Set<string>();
    for (const d of eachDate(s, e)) set.add(d);
    byType.set(l.leaveType, set);
    days.set(l.staffId, byType);
  }
  const result: Record<string, UnpaidResult> = {};
  for (const [staffId, byType] of days) {
    const r: UnpaidResult = { days: 0, byType: {} };
    for (const [type, set] of byType) {
      const sorted = [...set].sort();
      const excessInMonth = sorted.filter((d, i) => i >= quotas[type] && d >= start && d <= end).length;
      if (excessInMonth > 0) {
        r.byType[type] = excessInMonth;
        r.days += excessInMonth;
      }
    }
    if (r.days > 0) result[staffId] = r;
  }
  return result;
}

export type SalaryRow = {
  basicSalary: number; hra: number; da: number; tdsPercent: number; epfPercent: number;
  taxMode?: string; taxRegime?: string; annualDeductions?: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One month's payslip figures.
 *  - TDS: taxMode 'slab' → projected annual income tax ÷ 12 (payroll-tax.ts, FY rules);
 *    taxMode 'flat' (legacy) → gross × tdsPercent %.
 *  - Professional tax from the school's PT slabs (February may differ).
 *  - EPF: epfPercent of basic, capped at the school's EPF wage ceiling when set.
 *  - Unpaid leave: basic / 30 per day, capped at basic.
 * Tax and PT are projected on the contracted monthly gross (before unpaid-leave docking).
 */
export function computePayslip(sal: SalaryRow, unpaidDays: number, month = '', rules: PayrollRules = FY2025_26) {
  const basic = sal.basicSalary;
  const gross = basic + sal.hra + sal.da;
  const unpaidDeduction = r2(Math.min(basic, (basic / 30) * unpaidDays));
  const mode: TaxMode = sal.taxMode === 'flat' ? 'flat' : 'slab';
  const regime: TaxRegime = sal.taxRegime === 'old' ? 'old' : 'new';
  const tax = mode === 'slab' ? monthlyTds(gross, regime, sal.annualDeductions ?? 0, rules) : null;
  const tds = tax ? tax.monthly : r2((gross * sal.tdsPercent) / 100);
  const epf = epfContribution(basic, sal.epfPercent, rules.epfWageCeiling);
  const pt = professionalTax(gross, month, rules.professionalTax.slabs);
  const net = r2(gross - tds - epf - pt - unpaidDeduction);
  return { basic, hra: sal.hra, da: sal.da, gross, tds, epf, pt, unpaidDeduction, net, taxMode: mode, regime, annualTax: tax?.annual ?? null };
}
