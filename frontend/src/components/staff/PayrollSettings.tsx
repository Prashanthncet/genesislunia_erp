"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, Field, Icon, Input, Select, useToast } from "@/components/ui";
import { errMsg, inr } from "./types";
import { confirmAction } from "@/components/confirm";

type Slab = { upTo: number | null; rate: number };
type Regime = { slabs: Slab[]; standardDeduction: number; rebate87A: { maxTaxable: number; maxRebate: number | null; marginalRelief: boolean } };
type PtSlab = { min: number; max: number | null; amount: number; februaryAmount?: number };
type Config = {
  stored: { professional_tax_preset?: string; epf_wage_ceiling?: number | null };
  effective: {
    version: string; label: string; cessRate: number;
    regimes: { new: Regime; old: Regime };
    professionalTax: { preset: string; slabs: PtSlab[] };
    epfWageCeiling: number | null;
  };
  notice: string;
  pt_presets: { id: string; label: string; slabs: PtSlab[] }[];
};

const slabText = (slabs: Slab[]) => {
  let lower = 0;
  return slabs.map((s) => {
    const t = `${inr(lower)}–${s.upTo === null ? "above" : inr(s.upTo)}: ${s.rate}%`;
    lower = s.upTo ?? lower;
    return t;
  });
};

const ptText = (slabs: PtSlab[]) =>
  slabs.length === 0
    ? "No professional tax"
    : slabs.map((s) => `${inr(s.min)}${s.max === null ? "+" : `–${inr(s.max)}`}: ${inr(s.amount)}${s.februaryAmount !== undefined ? ` (Feb ${inr(s.februaryAmount)})` : ""}`).join(" · ");

/** School payroll rules: professional-tax preset, EPF wage ceiling, and the FY tax slabs in force. */
export function PayrollSettings({ onSaved }: { onSaved?: () => void }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [preset, setPreset] = useState("none");
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await apiFetch<Config>("/api/staff/payroll-config");
      setCfg(c);
      setPreset(c.effective.professionalTax.preset);
      setCeiling(c.effective.epfWageCeiling ? String(c.effective.epfWageCeiling) : "");
    } catch (e) {
      toast.push(errMsg(e), "error");
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const n = ceiling.trim() === "" ? null : Number(ceiling);
    if (n !== null && (!Number.isFinite(n) || n <= 0)) {
      toast.push("EPF wage ceiling must be a positive amount, or blank for none", "error");
      return;
    }
    if (!(await confirmAction({ title: "Save payroll settings?", text: "Professional tax and EPF rules change for the whole school. Regenerate draft payslips to apply them.", confirmText: "Save settings", tone: "primary" }))) return;
    setBusy(true);
    try {
      await apiFetch("/api/staff/payroll-config", {
        method: "PUT",
        body: JSON.stringify({ ...(preset !== "custom" ? { professional_tax_preset: preset } : {}), epf_wage_ceiling: n }),
      });
      toast.push("Payroll settings saved — regenerate draft payslips to apply", "success");
      await load();
      onSaved?.();
    } catch (e) {
      toast.push(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const chosen = cfg?.pt_presets.find((p) => p.id === preset);

  return (
    <Card className="p-4">
      <CardHead title="Payroll settings" icon="settings" subtitle="Deduction rules used by every payroll run for this school" />
      <p className="mb-3 flex items-start gap-2 rounded-xl border border-warn-line bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <span><strong>Rates as of FY 2025-26 — confirm with your CA before running payroll.</strong> Income tax uses the Indian slab rates, section 87A rebate and 4% cess; TDS is the projected annual tax ÷ 12. Surcharge marginal relief is not applied.</span>
      </p>
      {!cfg ? <p className="text-sm text-ink-3">Loading…</p> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3">
            <Field label="Professional tax" hint={chosen ? ptText(chosen.slabs) : ptText(cfg.effective.professionalTax.slabs)}>
              <Select aria-label="Professional tax preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
                {cfg.pt_presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                {preset === "custom" && <option value="custom">Custom slabs (set via API)</option>}
              </Select>
            </Field>
            <Field label="EPF wage ceiling (₹/month)" hint="EPF % is applied to basic capped at this amount. Blank = no ceiling.">
              <Input type="number" min={0} placeholder="e.g. 15000" value={ceiling} onChange={(e) => setCeiling(e.target.value)} />
            </Field>
            <Button variant="primary" className="max-md:w-full" loading={busy} onClick={save}>Save settings</Button>
          </div>
          {(["new", "old"] as const).map((k) => {
            const r = cfg.effective.regimes[k];
            return (
              <div key={k} className="rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px]">
                <div className="mb-1.5 flex items-center justify-between max-md:gap-2">
                  <span className="font-semibold text-ink">{k === "new" ? "New regime (default)" : "Old regime"}</span>
                  <Badge tone="slate">{cfg.effective.version}</Badge>
                </div>
                <ul className="tnum space-y-0.5 text-ink-2">
                  {slabText(r.slabs).map((t) => <li key={t}>{t}</li>)}
                </ul>
                <p className="mt-1.5 text-ink-3">
                  Standard deduction {inr(r.standardDeduction)} · 87A: nil tax up to {inr(r.rebate87A.maxTaxable)} taxable
                  {r.rebate87A.maxRebate !== null ? ` (rebate max ${inr(r.rebate87A.maxRebate)})` : ""}
                  {r.rebate87A.marginalRelief ? ", with marginal relief" : ""} · cess {cfg.effective.cessRate}%
                  {k === "old" ? " · minus declared 80C/80D deductions" : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
