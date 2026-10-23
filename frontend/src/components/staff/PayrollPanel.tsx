"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Field, Input, Select, StatCard, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { errMsg, inr, slipTone, totalDeductions, type Payslip, type Salary } from "./types";
import { PayrollSettings } from "./PayrollSettings";

type Preview = { quotas: Record<string, number>; unpaid: Record<string, { days: number; byType: Record<string, number> }> };
type StaffLite = { id: string; name: string; role: string; isActive: boolean };

const EMPTY_SAL = { basic_salary: "", hra: "0", da: "0", epf_percent: "12", tax_mode: "slab", tax_regime: "new", annual_deductions: "0", tds_percent: "0" };

export function PayrollPanel() {
  const toast = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [asDraft, setAsDraft] = useState(true);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [salStaff, setSalStaff] = useState("");
  const [sal, setSal] = useState(EMPTY_SAL);
  const [tdsPreview, setTdsPreview] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s, pv] = await Promise.all([
        apiFetch<Payslip[]>(`/api/staff/payslips?month=${month}`),
        apiFetch<Salary[]>("/api/staff/salaries"),
        apiFetch<Preview>(`/api/staff/payslips/unpaid-preview?month=${month}`),
      ]);
      setSlips(p);
      setSalaries(s);
      setPreview(pv);
    } catch (e) {
      toast.push(errMsg(e), "error");
    }
  }, [month, toast]);

  useEffect(() => { void load(); }, [load]);
  // The directory list needs STAFF_DIRECTORY (accounts lacks it): fall back to the salary list.
  useEffect(() => { apiFetch<StaffLite[]>("/api/staff?active=true").then(setStaff).catch(() => setStaff([])); }, []);

  const staffOptions = useMemo(() => {
    if (staff.length) return staff.map((s) => ({ id: s.id, name: s.name }));
    return salaries.map((s) => ({ id: s.staffId, name: s.staff.name }));
  }, [staff, salaries]);

  const counts = useMemo(() => ({
    Draft: slips.filter((s) => s.status === "Draft").length,
    Generated: slips.filter((s) => s.status === "Generated").length,
    Paid: slips.filter((s) => s.status === "Paid").length,
    net: slips.reduce((t, s) => t + s.netSalary, 0),
  }), [slips]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.push(ok, "success"); await load(); } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const generate = () => act(async () => {
    const entries = Object.entries(overrides).filter(([, v]) => v.trim() !== "");
    for (const [, v] of entries) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 31) throw new Error("Unpaid days must be between 0 and 31");
    }
    const unpaid = Object.fromEntries(entries.map(([k, v]) => [k, Number(v)]));
    const r = await apiFetch<{ generated: number; skipped: number; status: string }>("/api/staff/payslips/generate", {
      method: "POST",
      body: JSON.stringify({ month, as_draft: asDraft, ...(entries.length ? { unpaid_leave_days: unpaid } : {}) }),
    });
    toast.push(`${r.generated} payslip(s) ${r.status}, ${r.skipped} already released`, "success");
    setOverrides({});
  }, "Payroll run complete");

  const saveSalary = () => act(() => apiFetch(`/api/staff/salaries/${salStaff}`, {
    method: "PUT",
    body: JSON.stringify({
      basic_salary: Number(sal.basic_salary), hra: Number(sal.hra), da: Number(sal.da), epf_percent: Number(sal.epf_percent),
      tax_mode: sal.tax_mode, tax_regime: sal.tax_regime, annual_deductions: Number(sal.annual_deductions), tds_percent: Number(sal.tds_percent),
    }),
  }), "Salary structure saved");

  const pickSalary = (id: string) => {
    setSalStaff(id);
    const s = salaries.find((x) => x.staffId === id);
    setSal(s ? {
      basic_salary: String(s.basicSalary), hra: String(s.hra), da: String(s.da), epf_percent: String(s.epfPercent),
      tax_mode: s.taxMode === "flat" ? "flat" : "slab", tax_regime: s.taxRegime === "old" ? "old" : "new",
      annual_deductions: String(s.annualDeductions ?? 0), tds_percent: String(s.tdsPercent),
    } : EMPTY_SAL);
  };

  // Live TDS preview for the salary form (slab mode), from the school's rules on the server.
  const monthlyGross = Number(sal.basic_salary || 0) + Number(sal.hra || 0) + Number(sal.da || 0);
  useEffect(() => {
    if (sal.tax_mode !== "slab" || !(monthlyGross > 0)) { setTdsPreview(null); return; }
    const t = setTimeout(() => {
      apiFetch<{ monthly_tds: number }>("/api/staff/payroll/tax-preview", {
        method: "POST",
        body: JSON.stringify({ monthly_gross: monthlyGross, tax_regime: sal.tax_regime, annual_deductions: Number(sal.annual_deductions || 0) }),
      }).then((r) => setTdsPreview(r.monthly_tds)).catch(() => setTdsPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [monthlyGross, sal.tax_mode, sal.tax_regime, sal.annual_deductions]);

  const unpaidRows = preview ? Object.entries(preview.unpaid) : [];
  const nameOf = (id: string) => salaries.find((s) => s.staffId === id)?.staff.name ?? staffOptions.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Draft" value={counts.Draft} tone="amber" icon="edit" />
        <StatCard label="Generated" value={counts.Generated} tone="sky" icon="file" />
        <StatCard label="Paid" value={counts.Paid} tone="teal" icon="check" />
        <StatCard label={`Net payroll ${month}`} value={Math.round(counts.net)} prefix="₹" tone="brand" icon="wallet" />
      </div>

      <PayrollSettings onSaved={load} />

      <Card className="p-4">
        <CardHead
          title="Payroll run"
          icon="wallet"
          subtitle="Unpaid days = approved Unpaid leave + leave beyond the annual quota (Casual 12, Sick 8, Earned 15, Duty 10). Override per person below."
          actions={<Input type="month" aria-label="Payroll month" className="field w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />}
        />
        <div className="mb-3">
          {unpaidRows.length === 0 ? <p className="text-sm text-ink-3">No unpaid days derived for {month}.</p> : (
            <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
              {unpaidRows.map(([id, u]) => (
                <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/70 px-3 py-1.5">
                  <span>{nameOf(id)} <span className="text-xs text-ink-3">{Object.entries(u.byType).map(([t, d]) => `${t} ${d}`).join(", ")}</span></span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone="rose">{u.days} day(s)</Badge>
                    <Input aria-label={`Override unpaid days for ${nameOf(id)}`} type="number" min={0} max={31} step={0.5} placeholder="override" className="field w-24"
                      value={overrides[id] ?? ""} onChange={(e) => setOverrides({ ...overrides, [id]: e.target.value })} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} /> Create as Draft (review before releasing)</label>
          <Button variant="primary" loading={busy} onClick={generate}>Generate payslips</Button>
          {counts.Draft > 0 && (
            <Button variant="accent" loading={busy} onClick={() => act(() => apiFetch("/api/staff/payslips/finalize", { method: "POST", body: JSON.stringify({ month }) }), "Drafts released")}>
              Release {counts.Draft} draft(s)
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <CardHead title={`Payslips · ${month}`} icon="receipt" subtitle="Draft → Generated (visible to the staff member) → Paid" />
        {slips.length === 0 ? <EmptyState title="No payslips for this month" icon="receipt" /> : (
          <TableView id="payslips">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-3 py-2 text-left">Staff</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Unpaid days</th><th className="px-3 py-2 text-right">Deductions</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th></tr>
              </thead>
              <tbody>
                {slips.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-3 py-2"><span className="font-semibold">{p.staff?.name}</span> <span className="text-xs text-ink-3">{p.staff?.role}</span></td>
                    <td className="tnum px-3 py-2 text-right">{inr(p.grossSalary)}</td>
                    <td className="tnum px-3 py-2 text-right">{p.unpaidDays}</td>
                    <td className="tnum px-3 py-2 text-right" title={`TDS ${inr(p.tdsDeduction)} · Professional tax ${inr(p.professionalTax ?? 0)} · EPF ${inr(p.epfDeduction)} · Unpaid leave ${inr(p.otherDeductions)}`}>
                      {inr(totalDeductions(p))}
                      <span className="block text-[11px] text-ink-3">TDS {inr(p.tdsDeduction)} · PT {inr(p.professionalTax ?? 0)} · EPF {inr(p.epfDeduction)}</span>
                    </td>
                    <td className="tnum px-3 py-2 text-right font-semibold">{inr(p.netSalary)}</td>
                    <td className="px-3 py-2"><Badge tone={slipTone(p.status)}>{p.status}{p.paidAt ? ` ${p.paidAt.slice(0, 10)}` : ""}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.status === "Draft" && <Button size="sm" onClick={() => act(() => apiFetch(`/api/staff/payslips/${p.id}/finalize`, { method: "PUT" }), "Released")}>Release</Button>}
                        {p.status === "Generated" && <Button size="sm" variant="primary" onClick={() => act(() => apiFetch(`/api/staff/payslips/${p.id}/mark-paid`, { method: "PUT" }), "Marked paid")}>Mark paid</Button>}
                        <Button size="sm" onClick={() => apiDownload(`/api/staff/payslips/${p.id}/pdf`, `payslip-${p.monthYear}.pdf`).catch((e) => toast.push(errMsg(e), "error"))}>PDF</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        )}
      </Card>

      <Card className="p-4">
        <CardHead title="Salary structures" icon="wallet" subtitle={`${salaries.length} staff with a structure`} />
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <div className="col-span-2">
            <Field label="Staff">
              <Select value={salStaff} onChange={(e) => pickSalary(e.target.value)}>
                <option value="">Select…</option>
                {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          {([["basic_salary", "Basic (₹/month)"], ["hra", "HRA"], ["da", "DA"], ["epf_percent", "EPF % of basic"]] as const).map(([k, label]) => (
            <Field key={k} label={label}>
              <Input type="number" min={0} value={sal[k]} onChange={(e) => setSal({ ...sal, [k]: e.target.value })} />
            </Field>
          ))}
          <Field label="Income tax">
            <Select aria-label="Income tax mode" value={sal.tax_mode} onChange={(e) => setSal({ ...sal, tax_mode: e.target.value })}>
              <option value="slab">Slab rates (Indian income tax)</option>
              <option value="flat">Flat % (legacy)</option>
            </Select>
          </Field>
          {sal.tax_mode === "slab" ? (
            <>
              <Field label="Tax regime">
                <Select aria-label="Tax regime" value={sal.tax_regime} onChange={(e) => setSal({ ...sal, tax_regime: e.target.value })}>
                  <option value="new">New regime (default)</option>
                  <option value="old">Old regime</option>
                </Select>
              </Field>
              {sal.tax_regime === "old" && (
                <Field label="Declared deductions (₹/year)" hint="80C, 80D … as declared by the employee">
                  <Input type="number" min={0} value={sal.annual_deductions} onChange={(e) => setSal({ ...sal, annual_deductions: e.target.value })} />
                </Field>
              )}
            </>
          ) : (
            <Field label="TDS %">
              <Input type="number" min={0} max={100} value={sal.tds_percent} onChange={(e) => setSal({ ...sal, tds_percent: e.target.value })} />
            </Field>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={busy} disabled={!salStaff || !sal.basic_salary} onClick={saveSalary}>Save structure</Button>
          {sal.tax_mode === "slab" && tdsPreview !== null && (
            <span className="text-sm text-ink-2">
              Gross {inr(monthlyGross)}/month → projected TDS <strong className="tnum">{inr(tdsPreview)}</strong>/month (FY 2025-26 rates — confirm with your CA)
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
