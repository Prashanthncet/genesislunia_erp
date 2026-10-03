"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Field, Icon, Input, MailLink, PageHeader, Reveal, StatCard, useToast } from "@/components/ui";

type Staff = {
  id: string; name: string; email: string; role: string; isActive: boolean;
  salaryStructure: { basicSalary: number; hra: number; da: number } | null;
};
type Payslip = {
  id: string; monthYear: string; grossSalary: number; netSalary: number; tdsDeduction: number; epfDeduction: number; otherDeductions: number; status: string;
  staff: { id: string; name: string };
};

type Tab = "staff" | "salary" | "payroll";

export default function StaffPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  // staff form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", email: "", role: "Teacher", subjects: "", max_periods_per_day: "6" });

  // salary form
  const [salStaff, setSalStaff] = useState("");
  const [sal, setSal] = useState({ basic_salary: "", hra: "0", da: "0", tds_percent: "0", epf_percent: "12" });

  // payroll
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, ps] = await Promise.all([
        apiFetch<Staff[]>("/api/staff"),
        apiFetch<Payslip[]>("/api/staff/payslips"),
      ]);
      setStaff(st ?? []);
      setPayslips(ps ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.email) return setMessage("Name and email are required");
    setLoading(true);
    try {
      const body = JSON.stringify({
        name: form.name, email: form.email, role: form.role, subjects: form.subjects || undefined,
        max_periods_per_day: Number(form.max_periods_per_day) || undefined,
      });
      if (form.id) await apiFetch(`/api/staff/${form.id}`, { method: "PUT", body });
      else await apiFetch("/api/staff", { method: "POST", body });
      setShowForm(false);
      setForm({ id: "", name: "", email: "", role: "Teacher", subjects: "", max_periods_per_day: "6" });
      await load();
      setMessage("Saved ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deactivate = async (id: string) => {
    try { await apiFetch(`/api/staff/${id}`, { method: "DELETE" }); await load(); setMessage("Removed (soft-deactivated if history exists)"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const saveSalary = async () => {
    if (!salStaff || !sal.basic_salary) return setMessage("Staff and basic salary are required");
    setLoading(true);
    try {
      await apiFetch(`/api/staff/salaries/${salStaff}`, {
        method: "PUT",
        body: JSON.stringify({
          basic_salary: Number(sal.basic_salary), hra: Number(sal.hra), da: Number(sal.da),
          tds_percent: Number(sal.tds_percent), epf_percent: Number(sal.epf_percent),
        }),
      });
      await load();
      setMessage("Salary structure saved ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const generate = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ generated: number; skipped: number }>("/api/staff/payslips/generate", {
        method: "POST", body: JSON.stringify({ month }),
      });
      await load();
      setMessage(`Generated ${res.generated}, skipped ${res.skipped} (already generated)`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const markPaid = async (id: string) => {
    try { await apiFetch(`/api/staff/payslips/${id}/mark-paid`, { method: "PUT" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="staff"
          title="Staff & Payroll"
          subtitle="Staff master, salary structures and monthly payslips."
          actions={tab === "staff" && (
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <Icon name="plus" className="h-4 w-4" /> Add Staff
            </Button>
          )}
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Total Staff" value={staff.length} tone="brand" icon="staff" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Active" value={staff.filter((s) => s.isActive).length} tone="emerald" icon="check" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Payslips" value={payslips.length} tone="violet" icon="fees" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Payroll Cost" value={payslips.reduce((s, p) => s + p.netSalary, 0)} tone="amber" icon="reports" prefix="₹" />
        </Reveal>
      </div>

      <Reveal delay={60} className="flex flex-wrap gap-2">
        {(["staff", "salary", "payroll"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative overflow-hidden rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 ${
              tab === t ? "text-white shadow-lift" : "border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700"
            }`}>
            {tab === t && <span className="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-800" />}
            <span className="relative">{t === "staff" ? "Staff" : t === "salary" ? "Salary Structures" : "Payroll"}</span>
          </button>
        ))}
      </Reveal>

      {tab === "staff" && (
        <div key="staff" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Salary</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
              </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="row-hover border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{s.name}</td>
                  <td className="px-4 py-3 text-xs"><MailLink value={s.email} /></td>
                  <td className="px-4 py-3"><Badge tone="brand">{s.role}</Badge></td>
                  <td className="px-4 py-3 text-xs tnum">{s.salaryStructure ? fmt(s.salaryStructure.basicSalary + s.salaryStructure.hra + s.salaryStructure.da) + " gross" : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.isActive ? "emerald" : "slate"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => { setForm({ id: s.id, name: s.name, email: s.email, role: s.role, subjects: "", max_periods_per_day: "6" }); setShowForm(true); }} className="mr-2 btn-soft !px-2.5 !py-1 text-xs">Edit</button>
                    <button onClick={() => deactivate(s.id)} className="btn-danger !px-2.5 !py-1 text-xs">Remove</button>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No staff yet."}</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "salary" && (
        <div key="salary" className="max-w-xl space-y-4">
          <div className="card p-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="fees" className="h-4 w-4 text-brand-600" /> Set Salary Structure
            </h3>
            <div className="space-y-2">
              <select value={salStaff} aria-label="Staff" onChange={(e) => {
                setSalStaff(e.target.value);
                const existing = staff.find((s) => s.id === e.target.value)?.salaryStructure;
                if (existing) setSal({ basic_salary: String(existing.basicSalary), hra: String(existing.hra), da: String(existing.da), tds_percent: "0", epf_percent: "12" });
              }} className="field">
                <option value="">Select staff…</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input value={sal.basic_salary} onChange={(e) => setSal({ ...sal, basic_salary: e.target.value })} type="number" placeholder="Basic ₹ *" className="field w-auto" />
                <input value={sal.hra} onChange={(e) => setSal({ ...sal, hra: e.target.value })} type="number" placeholder="HRA ₹" className="field w-auto" />
                <input value={sal.da} onChange={(e) => setSal({ ...sal, da: e.target.value })} type="number" placeholder="DA ₹" className="field w-auto" />
                <input value={sal.tds_percent} onChange={(e) => setSal({ ...sal, tds_percent: e.target.value })} type="number" placeholder="TDS %" className="field w-auto" />
                <input value={sal.epf_percent} onChange={(e) => setSal({ ...sal, epf_percent: e.target.value })} type="number" placeholder="EPF %" className="field w-auto" />
              </div>
              <Button variant="primary" onClick={saveSalary} loading={loading}>Save Structure</Button>
            </div>
          </div>
        </div>
      )}

      {tab === "payroll" && (
        <div key="payroll" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <input value={month} onChange={(e) => setMonth(e.target.value)} type="month" className="field w-auto" />
            <Button variant="accent" onClick={generate} loading={loading}>
              <Icon name="spark" className="h-4 w-4" /> Generate Payslips
            </Button>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">TDS</th><th className="px-4 py-3 text-right">EPF</th><th className="px-4 py-3 text-right">Other</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id} className="row-hover border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">{p.staff.name}</td>
                    <td className="px-4 py-3">{p.monthYear}</td>
                    <td className="px-4 py-3 text-right tnum">{fmt(p.grossSalary)}</td>
                    <td className="px-4 py-3 text-right tnum text-rose-600">-{fmt(p.tdsDeduction)}</td>
                    <td className="px-4 py-3 text-right tnum text-rose-600">-{fmt(p.epfDeduction)}</td>
                    <td className="px-4 py-3 text-right tnum text-rose-600">-{fmt(p.otherDeductions)}</td>
                    <td className="px-4 py-3 text-right tnum font-bold text-brand-700">{fmt(p.netSalary)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={p.status === "Paid" ? "emerald" : "amber"}>{p.status}</Badge>
                    </td>
                  <td className="px-4 py-3 text-right">{p.status !== "Paid" && <button onClick={() => markPaid(p.id)} className="btn-soft !px-2.5 !py-1 text-xs">Mark Paid</button>}</td>
                  </tr>
                ))}
                {payslips.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No payslips yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-md p-6" style={{ animation: "scale-in 0.3s var(--ease-spring) both" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold">{form.id ? "Edit Staff" : "Add Staff"}</h3>
            <div className="space-y-3">
              <Field label="Full name" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rajesh Kumar" />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@sainik01.edu" />
              </Field>
              <Field label="Role">
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Teacher / Accountant / Warden…" />
              </Field>
              <Field label="Subjects" hint="Comma separated — drives timetable suggestions">
                <Input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="English, Hindi" />
              </Field>
              <Field label="Max periods per day">
                <Input value={form.max_periods_per_day} onChange={(e) => setForm({ ...form, max_periods_per_day: e.target.value })} type="number" />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="soft" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" onClick={save} loading={loading}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
