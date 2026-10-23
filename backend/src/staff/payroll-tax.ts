/**
 * Payroll deduction rules engine (plan Phase 9: "Salary structure + deduction rules engine").
 * Pure functions, no Prisma — unit-tested in payroll-tax.spec.ts.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────┐
 * │ RATES ARE AS OF FY 2025-26 (assessment year 2026-27), salaried individuals.          │
 * │ They were written from general knowledge of the Finance Act 2025 / Income-tax Act    │
 * │ and the state professional-tax schedules — NOT from an official source checked at    │
 * │ build time. A Chartered Accountant must confirm them before payroll is run, and      │
 * │ every figure can be overridden per school through PayrollConfig (no deploy needed).  │
 * └──────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Monthly TDS (taxMode 'slab'):
 *   annual taxable = monthly gross × 12 − standard deduction − (old regime: declared deductions)
 *   annual tax     = slab tax → section 87A rebate (new regime: with marginal relief)
 *                    → surcharge → 4% health & education cess
 *   monthly TDS    = annual tax ÷ 12, rounded to the rupee.
 * This is a straight-line projection: it ignores arrears, mid-year joiners, perquisites,
 * other income and the year-end true-up that a real Form 16 run does.
 *
 * Surcharge: rates are implemented, but MARGINAL RELIEF ON SURCHARGE IS NOT IMPLEMENTED
 * (a salary just above ₹50 L / ₹1 Cr will be over-deducted by up to the relief amount;
 * school salaries rarely reach these bands). taxMode 'flat' keeps the legacy behaviour:
 * TDS = gross × tdsPercent / 100.
 */

export type TaxRegime = 'new' | 'old';
export type TaxMode = 'slab' | 'flat';

/** A slab: income above the previous slab's `upTo` and up to this `upTo` is taxed at `rate` %. null = no ceiling. */
export type Slab = { upTo: number | null; rate: number };

export type RegimeRules = {
  slabs: Slab[];
  standardDeduction: number;
  /** Section 87A: full rebate of tax when taxable income ≤ maxTaxable, capped at maxRebate (null = no cap). */
  rebate87A: { maxTaxable: number; maxRebate: number | null; marginalRelief: boolean };
  /** Ascending thresholds: above `above` the surcharge is `rate` % of tax. */
  surcharge: { above: number; rate: number }[];
};

/** Professional tax slab on MONTHLY gross. `februaryAmount` replaces `amount` in February. */
export type PtSlab = { min: number; max: number | null; amount: number; februaryAmount?: number };
export type PtPreset = 'none' | 'karnataka' | 'maharashtra' | 'custom';

export type PayrollRules = {
  version: string;
  label: string;
  cessRate: number; // % on (tax + surcharge)
  regimes: Record<TaxRegime, RegimeRules>;
  professionalTax: { preset: PtPreset; slabs: PtSlab[] };
  /** EPF is epfPercent of basic, with basic capped at this wage ceiling when set (e.g. 15000). */
  epfWageCeiling: number | null;
};

const LAKH = 100_000;
const CRORE = 100 * LAKH;

/** Professional-tax presets (monthly gross). */
export const PT_PRESETS: Record<Exclude<PtPreset, 'custom'>, { label: string; slabs: PtSlab[] }> = {
  // Delhi (where the seeded school is) levies no professional tax.
  none: { label: 'None (e.g. Delhi)', slabs: [] },
  // Karnataka: ₹200 per month when monthly gross ≥ ₹25,000; nil below.
  // NOTE for the CA: the 2025 Karnataka amendment may allow ₹300 in February (annual ₹2,500);
  // if so, set preset 'custom' with februaryAmount: 300 on this slab.
  karnataka: { label: 'Karnataka', slabs: [{ min: 25_000, max: null, amount: 200 }] },
  // Maharashtra (men's schedule): ≤ ₹7,500 nil; ₹7,501–10,000 ₹175; > ₹10,000 ₹200, ₹300 in February
  // (annual ₹2,500). Women earning ≤ ₹25,000 are exempt — the staff record has no gender field,
  // so that exemption is NOT applied; use per-school custom slabs if it matters.
  maharashtra: {
    label: 'Maharashtra (men)',
    slabs: [
      { min: 0, max: 7_500, amount: 0 },
      { min: 7_501, max: 10_000, amount: 175 },
      { min: 10_001, max: null, amount: 200, februaryAmount: 300 },
    ],
  },
};

/** Default rules — FY 2025-26 (AY 2026-27). Versioned so next year's set can sit beside it. */
export const FY2025_26: PayrollRules = {
  version: 'FY2025-26',
  label: 'Rates as of FY 2025-26 (AY 2026-27) — confirm with your CA before running payroll',
  cessRate: 4,
  regimes: {
    // Section 115BAC (default regime), as amended by the Finance Act 2025.
    new: {
      slabs: [
        { upTo: 4 * LAKH, rate: 0 },
        { upTo: 8 * LAKH, rate: 5 },
        { upTo: 12 * LAKH, rate: 10 },
        { upTo: 16 * LAKH, rate: 15 },
        { upTo: 20 * LAKH, rate: 20 },
        { upTo: 24 * LAKH, rate: 25 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 75_000,
      // Zero tax up to ₹12 L taxable (rebate up to ₹60,000); above it, tax may not exceed the
      // income above ₹12 L (marginal relief).
      rebate87A: { maxTaxable: 12 * LAKH, maxRebate: null, marginalRelief: true },
      // New regime surcharge is capped at 25%.
      surcharge: [
        { above: 50 * LAKH, rate: 10 },
        { above: 1 * CRORE, rate: 15 },
        { above: 2 * CRORE, rate: 25 },
      ],
    },
    // Old regime, individuals below 60.
    old: {
      slabs: [
        { upTo: 2.5 * LAKH, rate: 0 },
        { upTo: 5 * LAKH, rate: 5 },
        { upTo: 10 * LAKH, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 50_000,
      rebate87A: { maxTaxable: 5 * LAKH, maxRebate: 12_500, marginalRelief: false },
      surcharge: [
        { above: 50 * LAKH, rate: 10 },
        { above: 1 * CRORE, rate: 15 },
        { above: 2 * CRORE, rate: 25 },
        { above: 5 * CRORE, rate: 37 },
      ],
    },
  },
  professionalTax: { preset: 'none', slabs: [] },
  epfWageCeiling: null,
};

/** What a school stores in PayrollConfig.config (JSON). Every field is optional. */
export type StoredPayrollConfig = {
  professional_tax_preset?: PtPreset;
  /** Only used with preset 'custom'. */
  professional_tax_slabs?: PtSlab[];
  epf_wage_ceiling?: number | null;
  /** Per-school overrides of the FY defaults (e.g. next year's slabs before a deploy). */
  tax_overrides?: {
    version?: string;
    cess_rate?: number;
    new?: Partial<RegimeRules>;
    old?: Partial<RegimeRules>;
  };
};

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function validSlabs(slabs: unknown): string | null {
  if (!Array.isArray(slabs) || slabs.length === 0 || slabs.length > 20) return 'slabs must be a non-empty list (max 20)';
  let prev = 0;
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i] as Slab;
    if (!num(s?.rate) || s.rate < 0 || s.rate > 100) return 'slab rate must be 0–100';
    const last = i === slabs.length - 1;
    if (last ? s.upTo !== null : !num(s.upTo) || (s.upTo as number) <= prev) return 'slab upTo values must rise, and only the last slab may be open-ended (null)';
    if (!last) prev = s.upTo as number;
  }
  return null;
}

function validRegime(r: unknown, name: string): string | null {
  if (r === undefined) return null;
  if (typeof r !== 'object' || r === null) return `${name} must be an object`;
  const x = r as Partial<RegimeRules>;
  if (x.slabs !== undefined) { const e = validSlabs(x.slabs); if (e) return `${name}: ${e}`; }
  if (x.standardDeduction !== undefined && (!num(x.standardDeduction) || x.standardDeduction < 0)) return `${name}: standardDeduction must be ≥ 0`;
  if (x.rebate87A !== undefined) {
    const b = x.rebate87A;
    if (!b || !num(b.maxTaxable) || b.maxTaxable < 0 || !(b.maxRebate === null || (num(b.maxRebate) && b.maxRebate >= 0)) || typeof b.marginalRelief !== 'boolean') {
      return `${name}: rebate87A needs maxTaxable ≥ 0, maxRebate (number or null) and marginalRelief (boolean)`;
    }
  }
  if (x.surcharge !== undefined) {
    if (!Array.isArray(x.surcharge) || x.surcharge.length > 10) return `${name}: surcharge must be a list`;
    let prev = -1;
    for (const s of x.surcharge) {
      if (!num(s?.above) || !num(s?.rate) || s.rate < 0 || s.rate > 100 || s.above <= prev) return `${name}: surcharge thresholds must rise with rates 0–100`;
      prev = s.above;
    }
  }
  return null;
}

/** Returns an error message or null. */
export function validatePtSlabs(slabs: unknown): string | null {
  if (!Array.isArray(slabs) || slabs.length > 20) return 'professional_tax_slabs must be a list (max 20)';
  for (const s of slabs as PtSlab[]) {
    if (!num(s?.min) || s.min < 0) return 'each professional tax slab needs min ≥ 0';
    if (!(s.max === null || (num(s.max) && s.max >= s.min))) return 'professional tax slab max must be null or ≥ min';
    if (!num(s.amount) || s.amount < 0 || s.amount > 2_500) return 'professional tax amount must be 0–2500 per month';
    if (s.februaryAmount !== undefined && (!num(s.februaryAmount) || s.februaryAmount < 0 || s.februaryAmount > 2_500)) return 'februaryAmount must be 0–2500';
  }
  return null;
}

/** Validates a stored config. Returns an error message or null. */
export function validatePayrollConfig(c: StoredPayrollConfig): string | null {
  const presets: PtPreset[] = ['none', 'karnataka', 'maharashtra', 'custom'];
  if (c.professional_tax_preset !== undefined && !presets.includes(c.professional_tax_preset)) return `professional_tax_preset must be one of ${presets.join(', ')}`;
  if (c.professional_tax_preset === 'custom') {
    const e = validatePtSlabs(c.professional_tax_slabs ?? []);
    if (e) return e;
  }
  if (c.epf_wage_ceiling !== undefined && c.epf_wage_ceiling !== null && (!num(c.epf_wage_ceiling) || c.epf_wage_ceiling <= 0 || c.epf_wage_ceiling > 1_000_000)) {
    return 'epf_wage_ceiling must be a positive amount or null';
  }
  const o = c.tax_overrides;
  if (o !== undefined) {
    if (typeof o !== 'object' || o === null) return 'tax_overrides must be an object';
    if (o.cess_rate !== undefined && (!num(o.cess_rate) || o.cess_rate < 0 || o.cess_rate > 20)) return 'cess_rate must be 0–20';
    return validRegime(o.new, 'new') ?? validRegime(o.old, 'old');
  }
  return null;
}

/** Effective rules for a school: FY defaults with its stored overrides applied. */
export function resolvePayrollRules(stored?: StoredPayrollConfig | null, base: PayrollRules = FY2025_26): PayrollRules {
  const c = stored ?? {};
  const preset = c.professional_tax_preset ?? base.professionalTax.preset;
  const ptSlabs = preset === 'custom' ? c.professional_tax_slabs ?? [] : PT_PRESETS[preset].slabs;
  const o = c.tax_overrides ?? {};
  return {
    version: o.version ?? base.version,
    label: o.version ? `Rates customised by the school (${o.version}) — confirm with your CA` : base.label,
    cessRate: o.cess_rate ?? base.cessRate,
    regimes: {
      new: { ...base.regimes.new, ...(o.new ?? {}) },
      old: { ...base.regimes.old, ...(o.old ?? {}) },
    },
    professionalTax: { preset, slabs: ptSlabs },
    epfWageCeiling: c.epf_wage_ceiling === undefined ? base.epfWageCeiling : c.epf_wage_ceiling,
  };
}

/** Tax on `income` under progressive slabs (no rebate / cess). */
export function slabTax(income: number, slabs: Slab[]): number {
  let tax = 0;
  let lower = 0;
  for (const s of slabs) {
    const upper = s.upTo ?? Infinity;
    if (income > lower) tax += ((Math.min(income, upper) - lower) * s.rate) / 100;
    lower = upper;
    if (income <= upper) break;
  }
  return tax;
}

export type AnnualTax = {
  regime: TaxRegime;
  gross: number;
  standardDeduction: number;
  declaredDeductions: number;
  taxable: number;
  slabTax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Annual income tax for a salaried individual. */
export function annualIncomeTax(annualGross: number, regime: TaxRegime, annualDeductions = 0, rules: PayrollRules = FY2025_26): AnnualTax {
  const r = rules.regimes[regime];
  const declared = regime === 'old' ? Math.max(0, annualDeductions) : 0;
  const taxable = Math.max(0, annualGross - r.standardDeduction - declared);
  const base = slabTax(taxable, r.slabs);

  let rebate = 0;
  if (taxable <= r.rebate87A.maxTaxable) {
    rebate = r.rebate87A.maxRebate === null ? base : Math.min(base, r.rebate87A.maxRebate);
  } else if (r.rebate87A.marginalRelief) {
    // Tax payable may not exceed the income earned above the rebate threshold.
    const excess = taxable - r.rebate87A.maxTaxable;
    if (base > excess) rebate = base - excess;
  }
  const afterRebate = base - rebate;

  // Highest band the income crosses. (No marginal relief on surcharge — see header.)
  const band = [...r.surcharge].reverse().find((s) => taxable > s.above);
  const surcharge = band ? (afterRebate * band.rate) / 100 : 0;
  const cess = ((afterRebate + surcharge) * rules.cessRate) / 100;
  return {
    regime,
    gross: annualGross,
    standardDeduction: r.standardDeduction,
    declaredDeductions: declared,
    taxable,
    slabTax: r2(base),
    rebate: r2(rebate),
    surcharge: r2(surcharge),
    cess: r2(cess),
    total: Math.round(afterRebate + surcharge + cess),
  };
}

/** Monthly TDS = projected annual tax on (monthly gross × 12) ÷ 12, to the rupee. */
export function monthlyTds(monthlyGross: number, regime: TaxRegime, annualDeductions = 0, rules: PayrollRules = FY2025_26) {
  const annual = annualIncomeTax(monthlyGross * 12, regime, annualDeductions, rules);
  return { monthly: Math.round(annual.total / 12), annual };
}

/** Professional tax for one month. `month` is YYYY-MM (February may differ). */
export function professionalTax(monthlyGross: number, month: string, slabs: PtSlab[]): number {
  // The slab with the highest `min` not above the gross (so paise between ₹10,000 and ₹10,001
  // can't fall into a gap); `max` is informational.
  const s = [...slabs].sort((a, b) => b.min - a.min).find((x) => monthlyGross >= x.min);
  if (!s) return 0;
  return month.endsWith('-02') && s.februaryAmount !== undefined ? s.februaryAmount : s.amount;
}

/** EPF: epfPercent of basic, basic capped at the wage ceiling when one is set. */
export function epfContribution(basic: number, epfPercent: number, ceiling: number | null): number {
  const wage = ceiling ? Math.min(basic, ceiling) : basic;
  return r2((wage * epfPercent) / 100);
}
