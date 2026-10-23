import { computePayslip } from './payroll';
import {
  annualIncomeTax, epfContribution, FY2025_26, monthlyTds, professionalTax, PT_PRESETS, resolvePayrollRules, slabTax, validatePayrollConfig,
} from './payroll-tax';

/*
 * Worked examples, computed by hand from the FY 2025-26 rules in payroll-tax.ts.
 * (Rates come from general knowledge of the Finance Act 2025 — a CA must confirm them.)
 */
describe('payroll-tax — new regime (FY 2025-26)', () => {
  it('₹10 L gross → 0 tax (87A rebate)', () => {
    // taxable = 10,00,000 − 75,000 = 9,25,000
    // slab: 4–8 L @5% = 20,000; 8–9.25 L @10% = 12,500 → 32,500
    // taxable ≤ 12 L → rebate 32,500 → tax 0
    const t = annualIncomeTax(1_000_000, 'new');
    expect(t.taxable).toBe(925_000);
    expect(t.slabTax).toBe(32_500);
    expect(t.rebate).toBe(32_500);
    expect(t.total).toBe(0);
  });

  it('₹12.75 L gross → taxable exactly ₹12 L → 0 tax', () => {
    // slab: 20,000 + 40,000 = 60,000, fully rebated
    const t = annualIncomeTax(1_275_000, 'new');
    expect(t.taxable).toBe(1_200_000);
    expect(t.slabTax).toBe(60_000);
    expect(t.total).toBe(0);
  });

  it('₹15 L gross → ₹97,500 a year, ₹8,125 a month', () => {
    // taxable = 15,00,000 − 75,000 = 14,25,000
    // 4–8 L @5% = 20,000; 8–12 L @10% = 40,000; 12–14.25 L @15% = 33,750 → 93,750
    // > 12 L, income above 12 L = 2,25,000 > 93,750 → no marginal relief
    // cess 4% = 3,750 → 97,500 → monthly 8,125
    const t = annualIncomeTax(1_500_000, 'new');
    expect(t.slabTax).toBe(93_750);
    expect(t.rebate).toBe(0);
    expect(t.cess).toBe(3_750);
    expect(t.total).toBe(97_500);
    expect(monthlyTds(125_000, 'new').monthly).toBe(8_125);
  });

  it('marginal relief just above ₹12 L taxable', () => {
    // gross 12,85,000 → taxable 12,10,000
    // slab: 60,000 + 10,000 @15% = 61,500; income above 12 L = 10,000 → tax limited to 10,000
    // rebate = 51,500; cess 4% of 10,000 = 400 → 10,400
    const t = annualIncomeTax(1_285_000, 'new');
    expect(t.taxable).toBe(1_210_000);
    expect(t.slabTax).toBe(61_500);
    expect(t.rebate).toBe(51_500);
    expect(t.total).toBe(10_400);
  });

  it('marginal relief stops once slab tax ≤ income above ₹12 L', () => {
    // taxable 13,00,000: slab 60,000 + 15,000 = 75,000; above 12 L = 1,00,000 → no relief
    // 75,000 + 3,000 cess = 78,000
    const t = annualIncomeTax(1_375_000, 'new');
    expect(t.rebate).toBe(0);
    expect(t.total).toBe(78_000);
  });

  it('₹60 L gross → 10% surcharge', () => {
    // taxable 59,25,000. slabs to 24 L: 20k+40k+60k+80k+1,00k = 3,00,000; 24–59.25 L @30% = 10,57,500
    // tax 13,57,500; surcharge 10% = 1,35,750 → 14,93,250; cess 4% = 59,730 → 15,52,980
    const t = annualIncomeTax(6_000_000, 'new');
    expect(t.slabTax).toBe(1_357_500);
    expect(t.surcharge).toBe(135_750);
    expect(t.total).toBe(1_552_980);
  });

  it('new regime surcharge is capped at 25% even above ₹5 Cr', () => {
    const t = annualIncomeTax(60_000_000, 'new');
    expect(t.surcharge / (t.slabTax - t.rebate)).toBeCloseTo(0.25, 5);
  });

  it('declared 80C deductions are ignored in the new regime', () => {
    expect(annualIncomeTax(1_500_000, 'new', 150_000).total).toBe(97_500);
  });
});

describe('payroll-tax — old regime', () => {
  it('₹15 L gross with ₹1.5 L 80C → ₹2,10,600', () => {
    // taxable = 15,00,000 − 50,000 − 1,50,000 = 13,00,000
    // 2.5–5 L @5% = 12,500; 5–10 L @20% = 1,00,000; 10–13 L @30% = 90,000 → 2,02,500
    // cess 8,100 → 2,10,600 → monthly 17,550
    const t = annualIncomeTax(1_500_000, 'old', 150_000);
    expect(t.taxable).toBe(1_300_000);
    expect(t.slabTax).toBe(202_500);
    expect(t.total).toBe(210_600);
    expect(monthlyTds(125_000, 'old', 150_000).monthly).toBe(17_550);
  });

  it('87A: taxable ≤ ₹5 L → 0; just above → full tax (no marginal relief)', () => {
    // gross 5,40,000 → taxable 4,90,000 → 2,40,000 @5% = 12,000 → rebated → 0
    expect(annualIncomeTax(540_000, 'old').total).toBe(0);
    // gross 5,60,000 → taxable 5,10,000 → 12,500 + 10,000 @20% = 14,500 + 580 cess = 15,080
    expect(annualIncomeTax(560_000, 'old').total).toBe(15_080);
  });
});

describe('professional tax', () => {
  const ka = PT_PRESETS.karnataka.slabs;
  const mh = PT_PRESETS.maharashtra.slabs;
  it('Karnataka: ₹200 when monthly gross ≥ ₹25,000', () => {
    expect(professionalTax(30_000, '2026-04', ka)).toBe(200);
    expect(professionalTax(25_000, '2026-02', ka)).toBe(200);
    expect(professionalTax(24_999, '2026-04', ka)).toBe(0);
  });
  it('Maharashtra: nil / ₹175 / ₹200, and ₹300 in February', () => {
    expect(professionalTax(7_500, '2026-04', mh)).toBe(0);
    expect(professionalTax(9_000, '2026-04', mh)).toBe(175);
    expect(professionalTax(10_000, '2026-04', mh)).toBe(175);
    expect(professionalTax(10_000.5, '2026-04', mh)).toBe(175);
    expect(professionalTax(20_000, '2026-03', mh)).toBe(200);
    expect(professionalTax(20_000, '2027-02', mh)).toBe(300);
  });
  it('none (Delhi) → 0', () => {
    expect(professionalTax(500_000, '2026-02', PT_PRESETS.none.slabs)).toBe(0);
  });
});

describe('EPF and payslip', () => {
  it('EPF wage ceiling caps the basic used', () => {
    expect(epfContribution(30_000, 12, 15_000)).toBe(1_800);
    expect(epfContribution(30_000, 12, null)).toBe(3_600);
  });

  it('flat mode keeps the legacy tdsPercent behaviour', () => {
    // gross 37,000; TDS 5% = 1,850; EPF 12% of 30,000 = 3,600; 1 unpaid day = 1,000 → 30,550
    const p = computePayslip({ basicSalary: 30_000, hra: 5_000, da: 2_000, tdsPercent: 5, epfPercent: 12, taxMode: 'flat' }, 1, '2026-04');
    expect(p).toMatchObject({ gross: 37_000, tds: 1_850, epf: 3_600, pt: 0, unpaidDeduction: 1_000, net: 30_550 });
  });

  it('slab mode, Karnataka PT, EPF ceiling', () => {
    // gross 1,25,000 → TDS 8,125 (₹15 L new regime); EPF 12% of 15,000 = 1,800; PT 200
    // net = 1,25,000 − 8,125 − 1,800 − 200 = 1,14,875
    const rules = resolvePayrollRules({ professional_tax_preset: 'karnataka', epf_wage_ceiling: 15_000 });
    const p = computePayslip({ basicSalary: 100_000, hra: 20_000, da: 5_000, tdsPercent: 10, epfPercent: 12, taxMode: 'slab', taxRegime: 'new' }, 0, '2026-04', rules);
    expect(p).toMatchObject({ tds: 8_125, epf: 1_800, pt: 200, net: 114_875 });
  });
});

describe('config', () => {
  it('defaults are FY 2025-26 with no PT and no EPF ceiling', () => {
    const r = resolvePayrollRules(null);
    expect(r.version).toBe('FY2025-26');
    expect(r.professionalTax.slabs).toEqual([]);
    expect(r.epfWageCeiling).toBeNull();
    expect(slabTax(800_000, r.regimes.new.slabs)).toBe(20_000);
  });
  it('overrides apply per school without touching the defaults', () => {
    const r = resolvePayrollRules({ tax_overrides: { version: 'FY2026-27', new: { standardDeduction: 100_000 } } });
    expect(r.regimes.new.standardDeduction).toBe(100_000);
    expect(r.regimes.new.slabs).toBe(FY2025_26.regimes.new.slabs);
    expect(FY2025_26.regimes.new.standardDeduction).toBe(75_000);
  });
  it('validation rejects bad configs', () => {
    expect(validatePayrollConfig({ professional_tax_preset: 'goa' as never })).toMatch(/preset/);
    expect(validatePayrollConfig({ epf_wage_ceiling: -1 })).toMatch(/epf/);
    expect(validatePayrollConfig({ professional_tax_preset: 'custom', professional_tax_slabs: [{ min: 0, max: null, amount: 9_999 }] })).toMatch(/amount/);
    expect(validatePayrollConfig({ tax_overrides: { new: { slabs: [{ upTo: 5, rate: 0 }, { upTo: 3, rate: 5 }, { upTo: null, rate: 10 }] } } })).toMatch(/rise/);
    expect(validatePayrollConfig({ professional_tax_preset: 'karnataka', epf_wage_ceiling: 15_000 })).toBeNull();
  });
});
