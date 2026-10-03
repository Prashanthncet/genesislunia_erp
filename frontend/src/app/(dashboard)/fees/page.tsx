"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, ProgressBar, Reveal, StatCard, useToast } from "@/components/ui";

type ClassItem = { id: string; name: string; section: string | null };
type Structure = { id: string; classId: string; feeType: string; amount: number; class?: { name: string; section: string | null } };
type Payment = { id: string; receiptNo: string | null; paymentDate: string; paymentMode: string; amountPaid: number };
type Invoice = {
  id: string;
  invoiceNo: string | null;
  term: string;
  totalAmount: number;
  status: string;
  dueDate: string;
  paid_amount: number;
  balance: number;
  payments?: Payment[];
  student: { id: string; fullName: string; admissionNo: string; class?: { name: string; section: string | null } };
};

type Tab = "structures" | "invoices";

export default function FeesPage() {
  const [tab, setTab] = useState<Tab>("invoices");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  // structure form
  const [sfClass, setSfClass] = useState("");
  const [sfType, setSfType] = useState("");
  const [sfAmount, setSfAmount] = useState("");

  // generate form
  const [genClass, setGenClass] = useState("");
  const [genTerm, setGenTerm] = useState("Term 1");
  const [genDue, setGenDue] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]);

  // payment form
  const [payInvoice, setPayInvoice] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("Cash");
  const [payRef, setPayRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [str, inv] = await Promise.all([
        apiFetch<Structure[]>("/api/fees/structures"),
        apiFetch<Invoice[]>("/api/fees/invoices"),
      ]);
      setStructures(str ?? []);
      setInvoices(inv ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiFetch<ClassItem[]>("/api/classes")
      .then((cs) => {
        setClasses(cs ?? []);
        if (cs?.length) { setSfClass(cs[0].id); setGenClass(cs[0].id); }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addStructure = async () => {
    if (!sfClass || !sfType || !sfAmount) return setMessage("Class, fee type and amount are required");
    setLoading(true);
    try {
      await apiFetch("/api/fees/structures", { method: "POST", body: JSON.stringify({ class_id: sfClass, fee_type: sfType, amount: Number(sfAmount) }) });
      setSfType(""); setSfAmount("");
      await load();
      setMessage("Fee structure added ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const removeStructure = async (id: string) => {
    try { await apiFetch(`/api/fees/structures/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const generate = async () => {
    if (!genClass || !genTerm || !genDue) return setMessage("Class, term and due date are required");
    setLoading(true);
    try {
      const res = await apiFetch<{ generated: number }>("/api/fees/invoices/generate", {
        method: "POST",
        body: JSON.stringify({ class_id: genClass, term: genTerm, due_date: genDue }),
      });
      await load();
      setMessage(`${res.generated} invoice(s) generated ✓`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const recordPayment = async () => {
    if (!payInvoice || !payAmount) return setMessage("Invoice and amount are required");
    setLoading(true);
    try {
      await apiFetch("/api/fees/payments", {
        method: "POST",
        body: JSON.stringify({ invoice_id: payInvoice, amount_paid: Number(payAmount), payment_mode: payMode, reference_no: payRef || undefined }),
      });
      setPayInvoice(""); setPayAmount(""); setPayRef("");
      await load();
      setMessage("Payment recorded ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const billed = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const outstanding = invoices.reduce((s, i) => s + i.balance, 0);

  const printReceipt = (inv: Invoice) => {
    const payments = inv.payments ?? [];
    const rows = payments.length
      ? payments.map((p) => `<tr><td>${p.receiptNo ?? "—"}</td><td>${p.paymentDate}</td><td>${p.paymentMode}</td><td style="text-align:right">${fmt(p.amountPaid)}</td></tr>`).join("")
      : `<tr><td colspan="4" style="text-align:center;color:#888">No payments recorded</td></tr>`;
    const w = window.open("", "_blank", "width=720,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Receipt ${inv.invoiceNo ?? ""}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}h1{font-size:18px;margin:0}h2{font-size:13px;color:#475569;font-weight:500}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}
      .meta{display:flex;justify-content:space-between;font-size:13px;margin-top:12px}</style></head><body>
      <h1>Genesis Lumia ERP — Fee Receipt</h1><h2>Sainik School Branch</h2>
      <div class="meta"><span><b>Invoice:</b> ${inv.invoiceNo ?? inv.id.slice(0, 8)}</span><span><b>Term:</b> ${inv.term}</span><span><b>Due:</b> ${inv.dueDate?.slice(0, 10)}</span></div>
      <div class="meta"><span><b>Student:</b> ${inv.student.fullName} (${inv.student.admissionNo})</span><span><b>Class:</b> ${inv.student.class ? `${inv.student.class.name} ${inv.student.class.section ?? ""}` : "—"}</span></div>
      <table><thead><tr><th>Receipt No</th><th>Date</th><th>Mode</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="meta"><span><b>Total:</b> ${fmt(inv.totalAmount)}</span><span><b>Paid:</b> ${fmt(inv.paid_amount)}</span><span><b>Balance:</b> ${fmt(inv.balance)}</span><span><b>Status:</b> ${inv.status}</span></div>
      <p style="margin-top:24px;font-size:11px;color:#94a3b8">Generated ${new Date().toLocaleString()} — computer-generated receipt.</p>
      </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="fees"
          title="Fees"
          subtitle="Fee structures, invoice generation and offline collection."
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Invoices" value={invoices.length} tone="brand" icon="fees" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Billed" value={invoices.reduce((s, i) => s + i.totalAmount, 0)} tone="violet" icon="reports" prefix="₹" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Collected" value={invoices.reduce((s, i) => s + i.paid_amount, 0)} tone="emerald" icon="check" prefix="₹" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Outstanding" value={invoices.reduce((s, i) => s + i.balance, 0)} tone="rose" icon="alert" prefix="₹" />
        </Reveal>
      </div>

      <Reveal delay={60} className="flex flex-wrap gap-2">
        {(["structures", "invoices"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative overflow-hidden rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 ${
              tab === t ? "text-white shadow-lift" : "border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700"
            }`}>
            {tab === t && <span className="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-800" />}
            <span className="relative">{t === "structures" ? "Fee Structures" : "Invoices & Payments"}</span>
          </button>
        ))}
      </Reveal>

      <Reveal delay={100}>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">Collection progress</span>
            <span className="tnum text-slate-500">
              {fmt(billed ? (billed - outstanding) / billed * 100 : 0)}%
            </span>
          </div>
          <ProgressBar value={billed ? (billed - outstanding) / billed * 100 : 0} tone="emerald" />
        </div>
      </Reveal>

      {tab === "structures" && (
        <div className="space-y-4" key="structures">
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <select value={sfClass} aria-label="Class" onChange={(e) => setSfClass(e.target.value)} className="field w-auto">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
            </select>
            <input value={sfType} onChange={(e) => setSfType(e.target.value)} placeholder="Fee type (e.g. Tuition)" className="field w-auto" />
            <input value={sfAmount} onChange={(e) => setSfAmount(e.target.value)} type="number" placeholder="Amount ₹" className="field w-32" />
            <Button variant="primary" onClick={addStructure} loading={loading}>Add Structure</Button>
          </div>
          <Reveal delay={80}>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Fee Type</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className="row-hover border-t border-slate-100">
                    <td className="px-4 py-3">{s.class ? `${s.class.name} ${s.class.section ?? ""}` : "—"}</td>
                    <td className="px-4 py-3 font-semibold">{s.feeType}</td>
                    <td className="px-4 py-3 text-right">{fmt(s.amount)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => removeStructure(s.id)} className="btn-danger !px-2.5 !py-1 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
                {structures.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No fee structures yet."}</td></tr>}
              </tbody>
            </table>
          </div>
          </Reveal>
        </div>
      )}

      {tab === "invoices" && (
        <div className="space-y-4" key="invoices">
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <select value={genClass} aria-label="Class" onChange={(e) => setGenClass(e.target.value)} className="field w-auto">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
            </select>
            <input value={genTerm} onChange={(e) => setGenTerm(e.target.value)} placeholder="Term" className="field w-28" />
            <input value={genDue} onChange={(e) => setGenDue(e.target.value)} type="date" className="field w-auto" />
            <Button variant="accent" onClick={generate} loading={loading}>
              <Icon name="spark" className="h-4 w-4" /> Generate Invoices
            </Button>
          </div>

          <div className="card flex flex-wrap items-center gap-2 p-4">
            <select value={payInvoice} aria-label="Invoice" onChange={(e) => setPayInvoice(e.target.value)} className="field max-w-xs">
              <option value="">Select invoice to pay…</option>
              {invoices.filter((i) => i.balance > 0).map((i) => (
                <option key={i.id} value={i.id}>{i.student.fullName} — {i.term} — balance {fmt(i.balance)}</option>
              ))}
            </select>
            <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} type="number" placeholder="Amount ₹" className="field w-32" />
            <select value={payMode} aria-label="Payment mode" onChange={(e) => setPayMode(e.target.value)} className="field w-auto">
              {["Cash", "Cheque", "UPI", "Bank Transfer"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Reference no" className="field w-36" />
            <Button variant="primary" onClick={recordPayment} loading={loading}>
              <Icon name="check" className="h-4 w-4" /> Record Payment
            </Button>
          </div>

          <Reveal delay={80}>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Term</th><th className="px-4 py-3">Due</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="row-hover border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{i.invoiceNo ?? "—"}</td>
                    <td className="px-4 py-3"><span className="font-semibold">{i.student.fullName}</span> <span className="text-xs text-slate-400">({i.student.admissionNo})</span></td>
                    <td className="px-4 py-3">{i.term}</td>
                    <td className="px-4 py-3 text-xs">{i.dueDate?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right">{fmt(i.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{fmt(i.paid_amount)}</td>
                    <td className="px-4 py-3 text-right text-rose-600">{fmt(i.balance)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={i.status === "Paid" ? "emerald" : i.status === "Partially Paid" ? "amber" : "rose"}>{i.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => printReceipt(i)} className="btn-soft !px-2.5 !py-1 text-xs">
                        <Icon name="print" className="h-3.5 w-3.5" /> Receipt
                      </button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No invoices yet."}</td></tr>}
              </tbody>
            </table>
          </div>
          </Reveal>
        </div>
      )}
    </div>
  );
}
