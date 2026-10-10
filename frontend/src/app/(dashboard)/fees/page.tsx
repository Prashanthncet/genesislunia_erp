"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, ProgressBar, Reveal, StatCard, useToast } from "@/components/ui";
import { Receipt, Coins, TrendingUp, AlertCircle, Download, Plus, Trash2, Search, Eye, Printer } from "lucide-react";

type ClassItem = { id: string; name: string; section: string | null };
type Invoice = { id: string; invoiceNo: string | null; term: string; totalAmount: number; status: string; dueDate: string; paid_amount: number; balance: number; student: { id: string; fullName: string; admissionNo: string; class?: { name: string; section: string | null } }; payments?: { id: string; receiptNo: string | null; paymentDate: string; paymentMode: string; amountPaid: number }[] };

type Tab = "invoices" | "structures";

export default function FeesPage() {
  const [tab, setTab] = useState<Tab>("invoices");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [genClass, setGenClass] = useState("");
  const [genTerm, setGenTerm] = useState("Term 1");
  const [genDue, setGenDue] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]);
  const [generating, setGenerating] = useState(false);

  const [payInvoice, setPayInvoice] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("Cash");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, cls] = await Promise.all([
        apiFetch<Invoice[]>("/api/fees/invoices"),
        apiFetch<ClassItem[]>("/api/classes"),
      ]);
      setInvoices(inv ?? []);
      setClasses(cls ?? []);
      if (cls?.length) setGenClass(cls[0].id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const generateInvoices = async () => {
    if (!genClass) return setMessage("Select class");
    setGenerating(true);
    try {
      const res = await apiFetch<{ generated: number }>("/api/fees/invoices/generate", {
        method: "POST",
        body: JSON.stringify({ class_id: genClass, term: genTerm, due_date: genDue }),
      });
      await loadAll();
      setMessage(`${res.generated} invoice(s) generated ✓`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setGenerating(false); }
  };

  const recordPayment = async () => {
    if (!payInvoice || !payAmount) return setMessage("Invoice and amount required");
    setPaying(true);
    try {
      await apiFetch("/api/fees/payments", {
        method: "POST",
        body: JSON.stringify({ invoice_id: payInvoice, amount_paid: Number(payAmount), payment_mode: payMode }),
      });
      setPayInvoice(""); setPayAmount("");
      await loadAll();
      setMessage("Payment recorded ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setPaying(false); }
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const filteredInvoices = invoices.filter((inv) => {
    if (searchQuery && !inv.student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) && !inv.student.admissionNo.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterStatus && inv.status !== filterStatus) return false;
    return true;
  });

  const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.paid_amount, 0);
  const totalOutstanding = invoices.reduce((s, i) => s + i.balance, 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <PageHeader icon="fees" title="Fees & Payments" subtitle="Manage fee structures, generate invoices, and track payments" />
          <Button variant="soft"><Download className="h-4 w-4" /> Export</Button>
        </div>
        <div className="flex items-center gap-2 px-6">
          <button onClick={() => setTab("invoices")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${tab === "invoices" ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}>
            <Receipt className="h-4 w-4" /> Invoices & Payments
            {invoices.length > 0 && <span className="px-2 py-0.5 text-xs rounded-full bg-slate-200 text-slate-600">{invoices.length}</span>}
          </button>
          <button onClick={() => setTab("structures")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${tab === "structures" ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}>
            <TrendingUp className="h-4 w-4" /> Fee Structures
          </button>
        </div>
      </div>

      <div className="relative z-10 p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}><div className="rounded-2xl bg-slate-900 p-5 text-white shadow-xl"><div className="flex items-center justify-between mb-3"><span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Invoices</span><Receipt className="h-5 w-5 text-slate-500" /></div><p className="text-3xl font-bold">{invoices.length}</p></div></Reveal>
          <Reveal delay={100}><div className="rounded-2xl bg-blue-50 border border-blue-200 p-5"><div className="flex items-center justify-between mb-3"><span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Total Billed</span><span className="text-xl font-bold text-blue-700">{fmt(totalBilled)}</span></div><div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: "100%" }} /></div></div></Reveal>
          <Reveal delay={200}><div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5"><div className="flex items-center justify-between mb-3"><span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Collected</span><span className="text-xl font-bold text-emerald-700">{fmt(totalCollected)}</span></div><div className="mt-2 h-2 bg-emerald-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${collectionRate}%` }} /></div></div></Reveal>
          <Reveal delay={300}><div className="rounded-2xl bg-rose-50 border border-rose-200 p-5"><div className="flex items-center justify-between mb-3"><span className="text-xs font-medium text-rose-600 uppercase tracking-wide">Outstanding</span><span className="text-xl font-bold text-rose-700">{fmt(totalOutstanding)}</span></div><div className="mt-2 flex items-center gap-2"><AlertCircle className="h-5 w-5 text-rose-500" /><span className="text-sm text-rose-600">{collectionRate < 80 ? "Needs attention" : "On track"}</span></div></div></Reveal>
        </div>

        <Reveal delay={100}>
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name or admission no..." className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500">
              <option value="">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </div>
        </Reveal>

        {tab === "invoices" && (
          <Reveal delay={150}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-slate-50/70 border-b border-slate-200">
                      <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-5 py-3.5 whitespace-nowrap">Student</th>
                        <th className="px-4 py-3.5 whitespace-nowrap">Class</th>
                        <th className="px-4 py-3.5 whitespace-nowrap">Term</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">Amount</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">Paid</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">Balance</th>
                        <th className="px-5 py-3.5 whitespace-nowrap text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-xs">{inv.student.fullName.charAt(0)}</div>
                              <div>
                                <p className="font-semibold text-slate-900">{inv.student.fullName}</p>
                                <p className="text-xs text-slate-400 font-mono">{inv.student.admissionNo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">{inv.student.class?.name} {inv.student.class?.section}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 font-medium">{inv.term}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-xs font-semibold text-slate-800">{fmt(inv.totalAmount)}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-xs text-emerald-600 font-semibold">{fmt(inv.paid_amount)}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-xs font-bold">
                            {inv.balance > 0 ? (
                              <span className="text-slate-800">{fmt(inv.balance)}</span>
                            ) : (
                              <span className="text-emerald-600 font-semibold">Paid</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-center">
                            <Badge tone={inv.status === "Paid" ? "emerald" : inv.status === "Partial" ? "amber" : "rose"} className="px-2.5 py-1">
                              {inv.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {filteredInvoices.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                            No invoices found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Generate Invoice</h3>
                  <div className="space-y-4">
                    <select value={genClass} onChange={(e) => setGenClass(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Select Class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}</select>
                    <div className="grid grid-cols-2 gap-3">
                      <select value={genTerm} onChange={(e) => setGenTerm(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="Term 1">Term 1</option><option value="Term 2">Term 2</option><option value="Annual">Annual</option></select>
                      <div><input type="date" value={genDue} onChange={(e) => setGenDue(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                    </div>
                    <Button variant="primary" onClick={generateInvoices} loading={generating} className="w-full shadow-lg shadow-blue-500/20"><Plus className="h-4 w-4" /> Generate Invoices</Button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Record Payment</h3>
                  <div className="space-y-4">
                    <select value={payInvoice} onChange={(e) => setPayInvoice(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Select Invoice</option>{invoices.filter(i => i.balance > 0).map(i => <option key={i.id} value={i.id}>{i.student.fullName} - {fmt(i.balance)}</option>)}</select>
                    <div className="grid grid-cols-2 gap-3">
                      <div><input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                      <select value={payMode} onChange={(e) => setPayMode(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option>Cash</option><option>UPI</option><option>Cheque</option><option>NEFT</option></select>
                    </div>
                    <Button variant="primary" onClick={recordPayment} loading={paying} disabled={!payInvoice || !payAmount} className="w-full shadow-lg shadow-blue-500/20"><Coins className="h-4 w-4" /> Record Payment</Button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                  <h3 className="font-semibold text-slate-800 mb-2">Collection Progress</h3>
                  <ProgressBar value={collectionRate} tone="emerald" className="h-3" />
                  <p className="text-sm text-slate-500 mt-2">{collectionRate}% collected of {fmt(totalBilled)}</p>
                </div>
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

