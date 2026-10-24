"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Select, SkeletonRows, StatCard, useToast } from "@/components/ui";
import { CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Chip, Metric, Monogram, RecordCard, StatusPill, initials, statusTone, toneFor } from "@/components/RecordCard";
import { formatDate } from "@/lib/format";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
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

  const downloadSlip = (p: Payslip) =>
    apiDownload(`/api/staff/payslips/${p.id}/pdf`, `payslip-${p.monthYear}.pdf`).catch((e) => toast.push(errMsg(e), "error"));

  const slipActions = (p: Payslip) => (
    <>
      {p.status === "Draft" && <Button type="button" size="sm" disabled={busy} onClick={() => act(() => apiFetch(`/api/staff/payslips/${p.id}/finalize`, { method: "PUT" }), "Released")}>Release</Button>}
      {p.status === "Generated" && <Button type="button" size="sm" variant="primary" disabled={busy} onClick={() => act(() => apiFetch(`/api/staff/payslips/${p.id}/mark-paid`, { method: "PUT" }), "Marked paid")}>Mark paid</Button>}
      <Button type="button" size="sm" variant="ghost" onClick={() => downloadSlip(p)} aria-label={`Download payslip PDF for ${p.staff?.name ?? "staff"}`}>
        <Icon name="download" className="h-3.5 w-3.5" /> PDF
      </Button>
    </>
  );

  const payslipCards = (
    <CardGrid min="19rem" empty={<CardEmpty title="No payslips for this month" hint="Run payroll above to generate them." icon="receipt" />}>
      {slips.map((p) => (
        <RecordCard key={p.id} rail={statusTone(p.status)}>
          <CardBody>
            <CardTitle
              lead={<Monogram text={initials(p.staff?.name)} tone={toneFor(p.staff?.department)} shape="circle" />}
              title={p.staff?.name ?? "Staff"}
              subtitle={`${p.staff?.role ?? ""}${p.staff?.department ? ` · ${p.staff.department}` : ""}`}
              aside={<StatusPill status={p.status} />}
            />
            <div className="flex items-end justify-between gap-3 rounded-lg bg-surface-2 px-3.5 py-3">
              <Metric label="Net pay" value={inr(p.netSalary)} size="lg" />
              <Metric label="Gross" value={inr(p.grossSalary)} align="right" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="TDS" value={inr(p.tdsDeduction)} />
              <Metric label="PT" value={inr(p.professionalTax ?? 0)} />
              <Metric label="EPF" value={inr(p.epfDeduction)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip icon="calendar">{p.monthYear}</Chip>
              {p.unpaidDays > 0 && <Chip icon="alert" tone="danger">{p.unpaidDays} unpaid day{p.unpaidDays === 1 ? "" : "s"}</Chip>}
              {p.paidAt && <Chip icon="check" tone="ok">Paid {formatDate(p.paidAt)}</Chip>}
            </div>
          </CardBody>
          <CardFooter>{slipActions(p)}</CardFooter>
        </RecordCard>
      ))}
    </CardGrid>
  );

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
        <TableView id="payslips" cards={loading ? undefined : payslipCards}>
          <div className="table-wrap max-h-[70vh] rounded-xl border border-line">
            <table className="data-table min-w-[56rem]">
              <thead>
                <tr>
                  <th>Staff</th><th className="th-end">Gross</th><th className="th-end">Unpaid days</th><th className="th-end">Deductions</th>
                  <th className="th-end">Net pay</th><th>Status</th><th className="th-end">Actions</th>
                </tr>
              </thead>
              {loading ? <SkeletonRows rows={5} cols={7} /> : (
                <tbody>
                  {slips.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="block font-semibold text-ink">{p.staff?.name}</span>
                        <span className="block text-xs text-ink-3">{p.staff?.role}{p.staff?.department ? ` · ${p.staff.department}` : ""}</span>
                      </td>
                      <td className="td-end tnum whitespace-nowrap">{inr(p.grossSalary)}</td>
                      <td className="td-end tnum">{p.unpaidDays || "—"}</td>
                      <td className="td-end tnum whitespace-nowrap" title={`TDS ${inr(p.tdsDeduction)} · Professional tax ${inr(p.professionalTax ?? 0)} · EPF ${inr(p.epfDeduction)} · Unpaid leave ${inr(p.otherDeductions)}`}>
                        {inr(totalDeductions(p))}
                        <span className="block text-[11px] text-ink-3">TDS {inr(p.tdsDeduction)} · PT {inr(p.professionalTax ?? 0)} · EPF {inr(p.epfDeduction)}</span>
                      </td>
                      <td className="td-end tnum whitespace-nowrap font-semibold text-ink">{inr(p.netSalary)}</td>
                      <td>
                        <Badge tone={slipTone(p.status)}>{p.status}</Badge>
                        {p.paidAt && <span className="mt-0.5 block text-[11px] text-ink-3">{formatDate(p.paidAt)}</span>}
                      </td>
                      <td className="td-end"><div className="flex justify-end gap-1 whitespace-nowrap">{slipActions(p)}</div></td>
                    </tr>
                  ))}
                  {slips.length === 0 && (
                    <tr><td colSpan={7}><EmptyState title="No payslips for this month" hint="Run payroll above to generate them." icon="receipt" /></td></tr>
                  )}
                </tbody>
              )}
              {!loading && slips.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-2/70 font-semibold">
                    <td className="border-t border-line-strong px-4 py-3">Total · {slips.length} payslip{slips.length === 1 ? "" : "s"}</td>
                    <td className="tnum border-t border-line-strong px-4 py-3 text-right whitespace-nowrap">{inr(slips.reduce((t, x) => t + x.grossSalary, 0))}</td>
                    <td className="tnum border-t border-line-strong px-4 py-3 text-right">{slips.reduce((t, x) => t + x.unpaidDays, 0) || "—"}</td>
                    <td className="tnum border-t border-line-strong px-4 py-3 text-right whitespace-nowrap">{inr(slips.reduce((t, x) => t + totalDeductions(x), 0))}</td>
                    <td className="tnum border-t border-line-strong px-4 py-3 text-right whitespace-nowrap">{inr(counts.net)}</td>
                    <td className="border-t border-line-strong px-4 py-3" /><td className="border-t border-line-strong px-4 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </TableView>
      </Card>

      <Card className="p-4">
        <CardHead title="Salary structures" icon="wallet" subtitle={`${salaries.length} staff with a structure`} />
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <div className="col-span-2">
            <Field label="Staff">
              <Select aria-label="Staff member" value={salStaff} onChange={(e) => pickSalary(e.target.value)}>
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
        <div className="mt-4">
          <TableView id="salary-structures">
            <div className="table-wrap max-h-[60vh] rounded-xl border border-line">
              <table className="data-table min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Staff</th><th className="th-end">Basic</th><th className="th-end">HRA</th><th className="th-end">DA</th>
                    <th className="th-end">Gross / month</th><th className="th-end">EPF</th><th>Income tax</th><th className="th-end">Actions</th>
                  </tr>
                </thead>
                {loading ? <SkeletonRows rows={4} cols={8} /> : (
                  <tbody>
                    {salaries.map((s) => (
                      <tr key={s.id} className={s.staffId === salStaff ? "bg-brand-50" : undefined}>
                        <td>
                          <span className="block font-semibold text-ink">{s.staff.name}</span>
                          <span className="block text-xs text-ink-3">{s.staff.role}{s.staff.department ? ` · ${s.staff.department}` : ""}</span>
                        </td>
                        <td className="td-end tnum whitespace-nowrap">{inr(s.basicSalary)}</td>
                        <td className="td-end tnum whitespace-nowrap">{inr(s.hra)}</td>
                        <td className="td-end tnum whitespace-nowrap">{inr(s.da)}</td>
                        <td className="td-end tnum whitespace-nowrap font-semibold text-ink">{inr(s.basicSalary + s.hra + s.da)}</td>
                        <td className="td-end tnum">{s.epfPercent}%</td>
                        <td>
                          {s.taxMode === "flat"
                            ? <Badge tone="slate">Flat {s.tdsPercent}%</Badge>
                            : <Badge tone="sky">Slab · {s.taxRegime === "old" ? "old" : "new"} regime</Badge>}
                        </td>
                        <td className="td-end">
                          <div className="flex justify-end">
                            <Button type="button" size="sm" onClick={() => pickSalary(s.staffId)} aria-label={`Edit salary of ${s.staff.name}`}>
                              <Icon name="edit" className="h-3.5 w-3.5" /> Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {salaries.length === 0 && (
                      <tr><td colSpan={8}><EmptyState title="No salary structures yet" hint="Pick a staff member above and save a structure." icon="wallet" /></td></tr>
                    )}
                  </tbody>
                )}
              </table>
            </div>
          </TableView>
        </div>
      </Card>
    </div>
  );
}
