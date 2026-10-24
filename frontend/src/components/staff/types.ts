import { inr as formatInr } from "@/lib/format";

export type StaffRow = {
  id: string; name: string; email: string; role: string; department: string | null; phone: string | null;
  subjects: string | null; maxPeriodsPerDay: number; isActive: boolean;
  user: { id: string; email: string; role: string; isActive: boolean } | null;
};

export type Payslip = {
  id: string; staffId: string; monthYear: string; basicSalary: number; hra: number; da: number; grossSalary: number;
  tdsDeduction: number; epfDeduction: number; professionalTax: number; otherDeductions: number; netSalary: number; unpaidDays: number;
  status: "Draft" | "Generated" | "Paid" | string; paidAt: string | null; generatedAt: string;
  staff?: { id: string; name: string; email: string; role: string; department: string | null };
};

export type Salary = {
  id: string; staffId: string; basicSalary: number; hra: number; da: number; tdsPercent: number; epfPercent: number;
  /** slab = Indian income-tax slabs; flat = legacy tdsPercent. */
  taxMode: "slab" | "flat" | string; taxRegime: "new" | "old" | string; annualDeductions: number;
  staff: { id: string; name: string; email: string; role: string; department: string | null };
};

/** Shared ₹ formatter (lib/format); paise only when the amount has them, so columns line up with `tnum`. */
export const inr = (n: number | null | undefined) =>
  n == null ? "—" : formatInr(n, { decimals: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });

/** Payslip status → Badge tone (colour + text). */
export const slipTone = (s: string) => (s === "Paid" ? "emerald" : s === "Generated" ? "sky" : "amber") as "emerald" | "sky" | "amber";

/** All deductions on a slip (TDS + professional tax + EPF + unpaid leave). */
export const totalDeductions = (p: Payslip) => p.tdsDeduction + (p.professionalTax ?? 0) + p.epfDeduction + p.otherDeductions;

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Request failed");
