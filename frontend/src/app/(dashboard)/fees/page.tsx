"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import { NUMBER_RE } from "@/lib/validation";
import { Badge, Button, EmptyState, Icon, Input, PageHeader, ProgressBar, Reveal, Select, useToast } from "@/components/ui";

import { TableView } from "@/components/TableView";
import { CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Chip, Meter, Monogram, RecordCard, StatusPill, initials, statusTone, toneFor } from "@/components/RecordCard";
import { StaggerItem } from "@/components/motion/AnimatedCards";
import { formatDate } from "@/lib/format";
import { confirmAction } from "@/components/confirm";
import { MobileFilters } from "@/components/mobile/MobileFilters";

type ClassItem = { id: string; name: string; section: string | null };
type Invoice = {
  id: string; invoiceNo: string | null; term: string; totalAmount: number; status: string; dueDate: string;
  paid_amount: number; balance: number; overdue: boolean;
  student: { id: string; fullName: string; admissionNo: string; class?: { name: string; section: string | null } | null };
  payments?: { id: string; receiptNo: string | null; paymentDate: string; paymentMode: string; amountPaid: number }[];
};
type Payment = {
  id: string; receiptNo: string | null; paymentDate: string; paymentMode: string; amountPaid: number; referenceNo: string | null;
  online: boolean; collector: { name: string } | null;
  invoice: { id: string; invoiceNo: string | null; term: string; student: { id: string; fullName: string; admissionNo: string } };
};
type Structure = { id: string; feeType: string; amount: number; classId: string; class: ClassItem };
type Defaulters = {
  as_of: string; total_overdue: number; count: number;
  students: {
    student: { id: string; fullName: string; admissionNo: string; mobileNumber: string | null; class: ClassItem | null };
    overdue_amount: number; overdue_invoices: number; oldest_due: string; days_overdue: number;
  }[];
};

type Tab = "invoices" | "payments" | "defaulters" | "structures";
const PAY_MODES = ["Cash", "UPI", "Cheque", "Bank Transfer", "Card", "Demand Draft"];

export default function FeesPage() {
  const { me, loading: meLoading } = useMe();
  const portal = isPortal(me);
  const canRead = hasRole(me, R.FEES_READ) || portal;
  const canWrite = hasRole(me, R.FEES_WRITE);
  const staffRead = hasRole(me, R.FEES_READ);

  const [tab, setTab] = useState<Tab>("invoices");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [defaulters, setDefaulters] = useState<Defaulters | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
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
  const [payRef, setPayRef] = useState("");
  const [paying, setPaying] = useState(false);

  const [stClass, setStClass] = useState("");
  const [stType, setStType] = useState("");
  const [stAmount, setStAmount] = useState("");
  const [structureClassFilter, setStructureClassFilter] = useState("");
  const [structureHeadFilter, setStructureHeadFilter] = useState("");
  const [structureSearch, setStructureSearch] = useState("");
  const [reminding, setReminding] = useState("");

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid|exceed|not found|forbidden/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const loadAll = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const inv = await apiFetch<Invoice[]>("/api/fees/invoices");
      setInvoices(inv ?? []);
      if (staffRead) {
        const [cls, pays, sts, def] = await Promise.all([
          apiFetch<ClassItem[]>("/api/classes"),
          apiFetch<Payment[]>("/api/fees/payments"),
          apiFetch<Structure[]>("/api/fees/structures"),
          apiFetch<Defaulters>("/api/fees/defaulters"),
        ]);
        setClasses(cls ?? []);
        setPayments(pays ?? []);
        setStructures(sts ?? []);
        setDefaulters(def);
        if (cls?.length) {
          setGenClass((c) => c || cls[0].id);
          setStClass((c) => c || cls[0].id);
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [canRead, staffRead]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const download = async (key: string, path: string, name: string) => {
    setBusy(key);
    try { await apiDownload(path, name); } catch (e) { setMessage(`Download failed: ${e instanceof Error ? e.message : "error"}`); } finally { setBusy(""); }
  };
  const receipt = (id: string, no: string | null) => download(`rc-${id}`, `/api/fees/payments/${id}/receipt.pdf`, `receipt-${no ?? id}.pdf`);
  const invoicePdf = (id: string, no: string | null) => download(`inv-${id}`, `/api/fees/invoices/${id}/invoice.pdf`, `invoice-${no ?? id}.pdf`);

  const sendPendingReminders = async (opts?: { invoice_id?: string; student_id?: string; label?: string }) => {
    const key = opts?.invoice_id ?? opts?.student_id ?? "all";
    const targetLabel = opts?.label ?? "all parents with pending fee instalments";
    if (!opts?.invoice_id && !opts?.student_id) {
      if (!(await confirmAction({
        title: "Send instalment reminder to pending parents only?",
        text: "Only parents with unpaid or partially-paid fee instalments will receive an SMS reminder. Settled/paid invoices are automatically excluded.",
        confirmText: "Send to Pending Parents",
        tone: "primary",
      }))) return;
    }
    setReminding(key);
    try {
      const res = await apiFetch<{ pending_invoices: number; paid_excluded: number; dispatched: number; skipped_no_contact: number }>(
        "/api/fees/reminders/pending",
        {
          method: "POST",
          body: JSON.stringify({
            ...(opts?.invoice_id ? { invoice_id: opts.invoice_id } : {}),
            ...(opts?.student_id ? { student_id: opts.student_id } : {}),
            channel: "sms",
          }),
        },
      );
      setMessage(
        `Instalment reminder sent for ${targetLabel}: ${res.dispatched} pending parent(s) notified (${res.paid_excluded} paid excluded)`,
      );
    } catch (e) {
      setMessage(`Failed: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setReminding("");
    }
  };

  const generateInvoices = async () => {
    if (!genClass) return setMessage("Select class (required)");
    const gc = classes.find((c) => c.id === genClass);
    const gcName = gc ? [gc.name, gc.section].filter(Boolean).join(" ") : "this class";
    if (!(await confirmAction({ title: `Generate ${genTerm} invoices for ${gcName}?`, text: `Every student in ${gcName} will be billed for ${genTerm} using the current fee heads, due ${formatDate(genDue)}.`, confirmText: "Generate", tone: "primary" }))) return;
    setGenerating(true);
    try {
      const res = await apiFetch<{ generated: number }>("/api/fees/invoices/generate", {
        method: "POST",
        body: JSON.stringify({ class_id: genClass, term: genTerm, due_date: genDue }),
      });
      await loadAll();
      setMessage(`${res.generated} invoice(s) generated`);
    } catch (e) { setMessage(`Failed: ${e instanceof Error ? e.message : ""}`); } finally { setGenerating(false); }
  };

  const recordPayment = async () => {
    if (!payInvoice || !payAmount) return setMessage("Invoice and amount required");
    const pi = invoices.find((i) => i.id === payInvoice);
    const amt = `₹${Number(payAmount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    if (!(await confirmAction({ title: `Record ${amt} from ${pi?.student.fullName ?? "this student"}?`, text: `${payMode}${payRef.trim() ? ` · Ref ${payRef.trim()}` : ""}${pi ? ` against ${pi.invoiceNo ?? pi.term}` : ""}. A receipt will be issued and downloaded.`, confirmText: "Record payment", tone: "primary" }))) return;
    setPaying(true);
    try {
      const res = await apiFetch<{ id: string; receipt_no: string }>("/api/fees/payments", {
        method: "POST",
        body: JSON.stringify({ invoice_id: payInvoice, amount_paid: Number(payAmount), payment_mode: payMode, ...(payRef.trim() ? { reference_no: payRef.trim() } : {}) }),
      });
      setPayInvoice(""); setPayAmount(""); setPayRef("");
      await loadAll();
      setMessage(`${amt} recorded${pi ? ` for ${pi.student.fullName}` : ""}: ${res.receipt_no}`);
      void receipt(res.id, res.receipt_no);
    } catch (e) { setMessage(`Failed: ${e instanceof Error ? e.message : ""}`); } finally { setPaying(false); }
  };

  const addStructure = async () => {
    if (!stClass || !stType.trim() || !stAmount) return setMessage("Class, fee head and amount required");
    try {
      await apiFetch("/api/fees/structures", { method: "POST", body: JSON.stringify({ class_id: stClass, fee_type: stType.trim(), amount: Number(stAmount) }) });
      setStType(""); setStAmount("");
      await loadAll();
      setMessage(`${stType.trim()} added`);
    } catch (e) { setMessage(`Failed: ${e instanceof Error ? e.message : ""}`); }
  };

  const removeStructure = async (id: string) => {
    const st = structures.find((x) => x.id === id);
    const stLabel = st ? `${st.feeType} (${[st.class?.name, st.class?.section].filter(Boolean).join(" ")})` : "this fee head";
    if (!(await confirmAction({ title: `Remove ${stLabel}?`, text: "It won't be billed on future invoices. Existing invoices are not changed.", confirmText: "Remove", tone: "danger" }))) return;
    try {
      await apiFetch(`/api/fees/structures/${id}`, { method: "DELETE" });
      await loadAll();
      setMessage(st ? `${st.feeType} removed` : "Fee head removed");
    } catch (e) { setMessage(`Failed: ${e instanceof Error ? e.message : ""}`); }
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase();
    if (q && !inv.student.fullName.toLowerCase().includes(q) && !inv.student.admissionNo.toLowerCase().includes(q) && !(inv.invoiceNo ?? "").toLowerCase().includes(q)) return false;
    if (filterStatus === "Overdue") return inv.overdue;
    if (filterStatus && inv.status !== filterStatus) return false;
    return true;
  });

  const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.paid_amount, 0);
  const totalOutstanding = invoices.reduce((s, i) => s + i.balance, 0);
  const overdueCount = invoices.filter((i) => i.overdue).length;
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  if (!meLoading && me && !canRead) {
    return (
      <div className="card">
        <EmptyState icon="lock" title="You don't have access to this page" hint="Fees are available to accounts, the office superintendent and school leadership." />
      </div>
    );
  }

  /** Card view: the balance is the answer, the meter shows how far along the invoice is. */
  const invoiceCards = (
    <CardGrid min="19rem" empty={<CardEmpty title="No invoices found" hint={canWrite ? "Generate invoices for a class from the panel on the right." : undefined} icon="receipt" />}>
      {filteredInvoices.map((inv, index) => {
        const paidPct = inv.totalAmount > 0 ? Math.round((inv.paid_amount / inv.totalAmount) * 100) : 0;
        const settled = inv.balance <= 0;
        const className = [inv.student.class?.name, inv.student.class?.section].filter(Boolean).join(" ");
        return (
          <StaggerItem key={inv.id} delay={Math.min(index, 8) * 40}>
          <RecordCard rail={inv.overdue ? "danger" : statusTone(inv.status)}>
            <CardBody>
              <CardTitle
                lead={<Monogram text={initials(inv.student.fullName)} tone={toneFor(className)} shape="circle" />}
                title={inv.student.fullName}
                subtitle={<span className="font-mono">{inv.student.admissionNo}</span>}
                aside={inv.overdue ? <Badge tone="rose">Overdue</Badge> : <StatusPill status={inv.status} />}
              />
              <div className="flex items-end justify-between gap-3 rounded-lg bg-surface-2 px-3.5 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{settled ? "Settled" : "Balance due"}</p>
                  <p className={`tnum text-[24px] font-bold leading-tight ${settled ? "text-ok-ink" : "text-ink"}`}>{settled ? fmt(inv.totalAmount) : fmt(inv.balance)}</p>
                </div>
                <p className="tnum pb-1 text-right text-[12px] text-ink-3">of <span className="font-semibold text-ink-2">{fmt(inv.totalAmount)}</span></p>
              </div>
              <Meter value={inv.paid_amount} max={inv.totalAmount} tone={settled ? "ok" : paidPct > 0 ? "warn" : "danger"} label={`${fmt(inv.paid_amount)} paid`} caption={`${paidPct}%`} />
              <div className="flex flex-wrap gap-1.5">
                {className && <Chip icon="layers">{className}</Chip>}
                <Chip icon="calendar">{inv.term}</Chip>
                {inv.dueDate && <Chip icon="clock" tone={inv.overdue ? "danger" : "slate"}>{inv.overdue ? "Overdue · " : "Due "}{formatDate(inv.dueDate)}</Chip>}
              </div>
            </CardBody>
            <CardFooter className="!justify-between">
              <span className="font-mono text-[11.5px] text-ink-3">{inv.invoiceNo ?? ""}</span>
              <div className="relative z-[2] flex flex-wrap items-center justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" loading={busy === `inv-${inv.id}`} onClick={() => invoicePdf(inv.id, inv.invoiceNo)} aria-label={`Download invoice ${inv.invoiceNo ?? ""} PDF`}>
                  <Icon name="download" className="h-3.5 w-3.5" /> Invoice PDF
                </Button>
                {(inv.payments ?? []).slice(-2).map((p) => (
                  <Button key={p.id} type="button" size="sm" variant="ghost" loading={busy === `rc-${p.id}`} onClick={() => receipt(p.id, p.receiptNo)} aria-label={`Download receipt ${p.receiptNo ?? ""} PDF`} title={`${p.receiptNo ?? "Receipt"} · ${fmt(p.amountPaid)}`}>
                    <Icon name="receipt" className="h-3.5 w-3.5" /> Receipt{(inv.payments?.length ?? 0) > 1 ? ` ${formatDate(p.paymentDate)}` : ""}
                  </Button>
                ))}
                {canWrite && !settled && (
                  <>
                    <Button type="button" size="sm" variant="soft" loading={reminding === inv.id} onClick={() => sendPendingReminders({ invoice_id: inv.id, label: inv.student.fullName })}>
                      <Icon name="bell" className="h-3.5 w-3.5" /> Remind Parent
                    </Button>
                    <Button type="button" size="sm" variant="primary" onClick={() => { setPayInvoice(inv.id); setPayAmount(String(inv.balance)); setMessage(`Ready to collect ${fmt(inv.balance)} from ${inv.student.fullName}`); }}>
                      <Icon name="fees" className="h-3.5 w-3.5" /> Collect
                    </Button>
                  </>
                )}
                {portal && !settled && (
                  <Link href="/portal/fees" className="btn btn-primary btn-sm">
                    <Icon name="wallet" className="h-3.5 w-3.5" /> Pay Fees
                  </Link>
                )}
              </div>
            </CardFooter>
          </RecordCard>
          </StaggerItem>
        );
      })}
    </CardGrid>
  );

  const uniqueFeeHeads = Array.from(new Set(structures.map((st) => st.feeType))).sort();
  const filteredStructures = structures.filter((st) => {
    if (structureClassFilter && st.classId !== structureClassFilter) return false;
    if (structureHeadFilter && st.feeType !== structureHeadFilter) return false;
    if (structureSearch.trim()) {
      const q = structureSearch.trim().toLowerCase();
      const clsLabel = `${st.class.name} ${st.class.section ?? ""}`.toLowerCase();
      if (!st.feeType.toLowerCase().includes(q) && !clsLabel.includes(q)) return false;
    }
    return true;
  });

  const defaulterCards = (
    <CardGrid min="19rem" empty={<CardEmpty title="No defaulters" hint="Every past-due invoice is settled." icon="check" />}>
      {(defaulters?.students ?? []).map((d, index) => {
        const className = d.student.class ? `${d.student.class.name} ${d.student.class.section ?? ""}`.trim() : "—";
        const severe = d.days_overdue > 60;
        return (
          <StaggerItem key={d.student.id} delay={Math.min(index, 8) * 40}>
            <RecordCard rail={severe ? "danger" : "warn"}>
              <CardBody>
                <CardTitle
                  lead={<Monogram text={initials(d.student.fullName)} tone={severe ? "danger" : "warn"} shape="circle" />}
                  title={<Link href={`/students/${d.student.id}`} className="hover:text-brand-700 hover:underline">{d.student.fullName}</Link>}
                  subtitle={<span className="font-mono">{d.student.admissionNo} · {className}</span>}
                  aside={
                    <Badge tone={severe ? "rose" : "amber"}>
                      {d.days_overdue} {d.days_overdue === 1 ? "day" : "days"} overdue
                    </Badge>
                  }
                />
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-2/80 p-3.5">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Overdue Amount</p>
                    <p className="tnum mt-0.5 text-[20px] font-bold leading-tight text-danger-ink">{fmt(d.overdue_amount)}</p>
                  </div>
                  <div className="border-l border-line pl-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Days Overdue</p>
                    <p className={`tnum mt-0.5 text-[20px] font-bold leading-tight ${severe ? "text-danger-ink" : "text-warn-ink"}`}>
                      {d.days_overdue} <span className="text-[12px] font-semibold">days</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip icon="layers">{className}</Chip>
                  <Chip icon="receipt" tone="danger">{d.overdue_invoices} overdue {d.overdue_invoices === 1 ? "invoice" : "invoices"}</Chip>
                  <Chip icon="calendar" tone="warn">Oldest due {formatDate(d.oldest_due)}</Chip>
                </div>
              </CardBody>
              {canWrite && (
                <CardFooter className="!justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="soft"
                    loading={reminding === d.student.id}
                    onClick={() => sendPendingReminders({ student_id: d.student.id, label: d.student.fullName })}
                  >
                    <Icon name="bell" className="h-3.5 w-3.5" /> Remind Pending Parent
                  </Button>
                </CardFooter>
              )}
            </RecordCard>
          </StaggerItem>
        );
      })}
    </CardGrid>
  );

  const tabBtn = (id: Tab, label: string, icon: string, count?: number) => (
    <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 max-md:min-h-11 max-md:shrink-0 max-md:snap-start max-md:gap-2 max-md:whitespace-nowrap max-md:px-3.5 max-md:py-2 ${tab === id ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-100" : "text-ink-2 hover:bg-surface-2"}`}>
      <Icon name={icon} className="h-4 w-4" /> {label}
      {count !== undefined && count > 0 && <span className="px-2 py-0.5 text-xs rounded-full bg-line text-ink-2">{count}</span>}
    </button>
  );

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 border-b border-line bg-white/80 backdrop-blur-xl max-sm:-mx-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 max-md:px-4">
          <PageHeader icon="fees" title={portal ? "Fees" : "Fees & Payments"}
            subtitle={portal ? "Invoices, payments and receipts for your child" : canWrite ? "Manage fee structures, generate invoices, and track payments" : "Read-only view of invoices, collections and defaulters"} />
          {!canWrite && !portal && <Badge tone="slate"><Icon name="eye" className="h-3.5 w-3.5" /> Read-only</Badge>}
        </div>
        <div className="m-scroll-x flex flex-wrap items-center gap-2 px-6 max-md:flex-nowrap max-md:gap-1.5 max-md:px-4 max-md:pb-3">
          {tabBtn("invoices", "Invoices", "receipt", invoices.length)}
          {staffRead && tabBtn("payments", "Payments", "wallet", payments.length)}
          {staffRead && tabBtn("defaulters", "Defaulters", "alert", defaulters?.count)}
          {staffRead && tabBtn("structures", "Fee Structures", "layers", structures.length)}
        </div>
      </div>

      <div className="relative z-10 p-6 space-y-6 max-md:space-y-4 max-md:px-0 max-md:py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 max-md:grid-cols-2 max-md:gap-3">
          <Reveal delay={0}><div className="rounded-xl bg-brand-900 p-5 text-white shadow-xl max-md:h-full max-md:p-4"><div className="flex items-center justify-between mb-3"><span className="text-xs font-medium text-white/55 uppercase tracking-wide">Total Invoices</span><Icon name="receipt" className="h-5 w-5 text-white/65" /></div><p className="text-3xl font-bold max-md:text-2xl">{invoices.length}</p></div></Reveal>
          <Reveal delay={100}><div className="rounded-xl bg-brand-50 border border-brand-200 p-5 max-md:h-full max-md:p-4"><div className="flex items-center justify-between mb-3 max-md:flex-col max-md:items-start max-md:gap-1"><span className="text-xs font-medium text-accent-600 uppercase tracking-wide">Total Billed</span><span className="text-xl font-bold text-brand-700 max-md:text-lg">{fmt(totalBilled)}</span></div><div className="mt-2 h-2 bg-brand-200 rounded-full overflow-hidden"><div className="h-full bg-brand-700 rounded-full" style={{ width: "100%" }} /></div></div></Reveal>
          <Reveal delay={200}><div className="rounded-xl bg-ok-soft border border-ok-line p-5 max-md:h-full max-md:p-4"><div className="flex items-center justify-between mb-3 max-md:flex-col max-md:items-start max-md:gap-1"><span className="text-xs font-medium text-ok uppercase tracking-wide">Collected</span><span className="text-xl font-bold text-ok-ink max-md:text-lg">{fmt(totalCollected)}</span></div><div className="mt-2 h-2 bg-ok-line rounded-full overflow-hidden"><div className="h-full bg-ok rounded-full" style={{ width: `${collectionRate}%` }} /></div></div></Reveal>
          <Reveal delay={300}><div className="rounded-xl bg-danger-soft border border-danger-line p-5 max-md:h-full max-md:p-4"><div className="flex items-center justify-between mb-3 max-md:flex-col max-md:items-start max-md:gap-1"><span className="text-xs font-medium text-danger uppercase tracking-wide">Outstanding</span><span className="text-xl font-bold text-danger-ink max-md:text-lg">{fmt(totalOutstanding)}</span></div><div className="mt-2 flex items-center gap-2"><Icon name="alert" className="h-5 w-5 text-danger" /><span className="text-sm text-danger">{overdueCount ? `${overdueCount} overdue invoice(s)` : "Nothing overdue"}</span></div></div></Reveal>
        </div>

        {tab === "invoices" && (
          <>
            <Reveal delay={100}>
              <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-white border border-line shadow-sm max-md:gap-3 max-md:p-3">
                <div className="relative flex-1 min-w-[200px] max-md:min-w-0 max-md:basis-full">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search invoices" placeholder="Search by name, admission no or invoice no..." className="w-full rounded-lg border border-line-strong bg-surface-2 pl-10 pr-4 py-2.5 text-sm focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20 max-md:min-h-11" />
                </div>
                <MobileFilters active={filterStatus ? 1 : 0} label="Status">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status" className="appearance-none rounded-lg border border-line-strong bg-surface-2 px-4 py-2.5 pr-10 text-sm text-ink-2 focus:border-brand-700 max-md:min-h-11 max-md:w-full">
                  <option value="">All Status</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Paid">Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Partial">Partial</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
                </MobileFilters>
                {canWrite && (
                  <Button type="button" size="sm" variant="soft" loading={reminding === "all"} onClick={() => sendPendingReminders()}>
                    <Icon name="bell" className="h-4 w-4" /> Send Instalment Reminder (Pending Parents Only)
                  </Button>
                )}
              </div>
            </Reveal>
            <Reveal delay={150}>
              <div className={`grid grid-cols-1 gap-6 max-md:gap-4 ${canWrite ? "lg:grid-cols-3" : ""}`}>
                <div className={`${canWrite ? "lg:col-span-2" : ""} rounded-xl border border-line bg-white shadow-soft overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <TableView id="fees-invoices" cards={invoiceCards}>
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-surface-2/70 border-b border-line">
                        <tr className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">
                          <th className="px-5 py-3.5 whitespace-nowrap">Student</th>
                          <th className="px-4 py-3.5 whitespace-nowrap">Invoice</th>
                          <th className="px-4 py-3.5 whitespace-nowrap">Term / Due</th>
                          <th className="px-4 py-3.5 whitespace-nowrap text-right">Amount</th>
                          <th className="px-4 py-3.5 whitespace-nowrap text-right">Paid</th>
                          <th className="px-4 py-3.5 whitespace-nowrap text-right">Balance</th>
                          <th className="px-4 py-3.5 whitespace-nowrap text-center">Status</th>
                          <th className="px-4 py-3.5 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-surface-2/70 transition-colors">
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <Link href={`/students/${inv.student.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">{inv.student.fullName}</Link>
                              <p className="text-xs text-ink-3 font-mono">{inv.student.admissionNo} · {inv.student.class?.name} {inv.student.class?.section}</p>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-ink-2">{inv.invoiceNo ?? "—"}</td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-xs text-ink-2">{inv.term}<span className={`block ${inv.overdue ? "font-semibold text-danger" : "text-ink-3"}`}>{formatDate(inv.dueDate)}</span></td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-xs font-semibold text-ink">{fmt(inv.totalAmount)}</td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-xs text-ok font-semibold">{fmt(inv.paid_amount)}</td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-xs font-bold">
                              {inv.balance > 0 ? <span className="text-ink">{fmt(inv.balance)}</span> : <span className="text-ok font-semibold">Paid</span>}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-center">
                              {inv.overdue
                                ? <Badge tone="rose" className="px-2.5 py-1">Overdue</Badge>
                                : <Badge tone={inv.status === "Paid" ? "emerald" : inv.status.startsWith("Partial") ? "amber" : "slate"} className="px-2.5 py-1">{inv.status}</Badge>}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="ghost" loading={busy === `inv-${inv.id}`} onClick={() => invoicePdf(inv.id, inv.invoiceNo)} aria-label={`Download invoice ${inv.invoiceNo ?? ""}`}>
                                  <Icon name="download" className="h-3.5 w-3.5" /> PDF
                                </Button>
                                {(inv.payments ?? []).slice(-1).map((p) => (
                                  <Button key={p.id} size="sm" variant="ghost" loading={busy === `rc-${p.id}`} onClick={() => receipt(p.id, p.receiptNo)} aria-label={`Download receipt ${p.receiptNo ?? ""}`}>
                                    <Icon name="receipt" className="h-3.5 w-3.5" /> Receipt
                                  </Button>
                                ))}
                                {canWrite && inv.balance > 0 && (
                                  <>
                                    <Button size="sm" variant="soft" loading={reminding === inv.id} onClick={() => sendPendingReminders({ invoice_id: inv.id, label: inv.student.fullName })}>
                                      <Icon name="bell" className="h-3.5 w-3.5" /> Remind
                                    </Button>
                                    <Button size="sm" variant="primary" onClick={() => { setPayInvoice(inv.id); setPayAmount(String(inv.balance)); }}>
                                      <Icon name="fees" className="h-3.5 w-3.5" /> Collect
                                    </Button>
                                  </>
                                )}
                                {portal && inv.balance > 0 && (
                                  <Link href="/portal/fees" className="btn btn-primary btn-sm">
                                    <Icon name="wallet" className="h-3.5 w-3.5" /> Pay Fees
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredInvoices.length === 0 && (
                          <tr><td colSpan={8} className="px-4 py-12 text-center text-ink-3">{loading ? "Loading invoices..." : "No invoices found"}</td></tr>
                        )}
                      </tbody>
                    </table>
                    </TableView>
                  </div>
                </div>
                {canWrite && (
                  <div className="space-y-6 max-md:space-y-4">
                    <div className="rounded-xl border border-line bg-white shadow-sm p-6 max-md:p-4">
                      <h3 className="font-semibold text-ink mb-4">Generate Invoice</h3>
                      <div className="space-y-4">
                        <Select value={genClass} onChange={(e) => setGenClass(e.target.value)} aria-label="Class to invoice"><option value="">Select Class</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}</Select>
                        <div className="grid grid-cols-2 gap-3">
                          <Select value={genTerm} onChange={(e) => setGenTerm(e.target.value)} aria-label="Term"><option value="Term 1">Term 1</option><option value="Term 2">Term 2</option><option value="Annual">Annual</option></Select>
                          <Input type="date" value={genDue} onChange={(e) => setGenDue(e.target.value)} aria-label="Due date" />
                        </div>
                        <Button variant="primary" onClick={generateInvoices} loading={generating} className="w-full"><Icon name="plus" className="h-4 w-4" /> Generate Invoices</Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-white shadow-sm p-6 max-md:p-4">
                      <h3 className="font-semibold text-ink mb-4">Record Payment</h3>
                      <div className="space-y-4">
                        <Select value={payInvoice} onChange={(e) => setPayInvoice(e.target.value)} aria-label="Invoice to pay"><option value="">Select Invoice</option>{invoices.filter((i) => i.balance > 0).map((i) => <option key={i.id} value={i.id}>{i.student.fullName} · {i.term} · {fmt(i.balance)}</option>)}</Select>
                        <div className="grid grid-cols-2 gap-3">
                          <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount" aria-label="Amount" />
                          <Select value={payMode} onChange={(e) => setPayMode(e.target.value)} aria-label="Payment mode">{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</Select>
                        </div>
                        <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Reference / cheque no (optional)" aria-label="Reference number" />
                        <Button variant="primary" onClick={recordPayment} loading={paying} disabled={!payInvoice || !payAmount} className="w-full"><Icon name="fees" className="h-4 w-4" /> Record Payment &amp; Print Receipt</Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-white shadow-sm p-6 max-md:p-4">
                      <h3 className="font-semibold text-ink mb-2">Collection Progress</h3>
                      <ProgressBar value={collectionRate} tone="emerald" className="h-3" />
                      <p className="text-sm text-ink-2 mt-2">{collectionRate}% collected of {fmt(totalBilled)}</p>
                    </div>
                  </div>
                )}
              </div>
            </Reveal>
          </>
        )}

        {tab === "payments" && staffRead && (
          <Reveal>
            <div className="rounded-xl border border-line bg-white shadow-soft overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5 max-md:px-4">
                <h3 className="font-semibold text-ink">Recent payments</h3>
                <span className="text-xs text-ink-3">Gateway payments are tagged <Badge tone="sky">Online</Badge></span>
              </div>
              <TableView id="fees-payments" mobileHide={["Invoice"]}>
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-2/70 border-b border-line">
                    <tr className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">
                      <th className="px-5 py-3">Receipt</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.map((p) => (
                      <tr key={p.id} className={p.online ? "bg-info-soft/40" : ""}>
                        <td className="px-5 py-3 font-mono text-xs">{p.receiptNo ?? "—"}</td>
                        <td className="px-4 py-3 text-xs tnum">{formatDate(p.paymentDate)}</td>
                        <td className="px-4 py-3"><span className="font-semibold text-ink">{p.invoice.student.fullName}</span><span className="block text-xs text-ink-3 font-mono">{p.invoice.student.admissionNo}</span></td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-2">{p.invoice.invoiceNo ?? "—"} · {p.invoice.term}</td>
                        <td className="px-4 py-3">{p.online ? <Badge tone="sky"><Icon name="spark" className="h-3 w-3" /> Online</Badge> : <span className="text-xs text-ink-2">{p.paymentMode}{p.collector ? ` · ${p.collector.name}` : ""}</span>}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold">{fmt(p.amountPaid)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button type="button" size="sm" variant="ghost" loading={busy === `rc-${p.id}`} onClick={() => receipt(p.id, p.receiptNo)} aria-label={`Download receipt ${p.receiptNo ?? ""} PDF`}><Icon name="download" className="h-3.5 w-3.5" /> Receipt PDF</Button>
                        </td>
                      </tr>
                    ))}
                    {payments.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-ink-3">No payments yet</td></tr>}
                  </tbody>
                </table>
              </TableView>
            </div>
          </Reveal>
        )}

        {tab === "defaulters" && staffRead && (
          <Reveal>
            <div className="rounded-xl border border-line bg-white shadow-soft overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5 max-md:px-4">
                <div>
                  <h3 className="font-semibold text-ink">Fee defaulters</h3>
                  <p className="text-xs text-ink-3">Invoices past their due date with a balance, as of {defaulters ? formatDate(defaulters.as_of) : "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-bold text-danger-ink">{fmt(defaulters?.total_overdue ?? 0)} overdue</span>
                  {canWrite && (defaulters?.count ?? 0) > 0 && (
                    <Button type="button" size="sm" variant="soft" loading={reminding === "all"} onClick={() => sendPendingReminders()}>
                      <Icon name="bell" className="h-3.5 w-3.5" /> Remind All Pending Parents
                    </Button>
                  )}
                </div>
              </div>
              <TableView id="fees-defaulters" cards={defaulterCards}>
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-2/70 border-b border-line">
                    <tr className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">
                      <th className="px-5 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3 text-right">Overdue invoices</th>
                      <th className="px-4 py-3">Oldest due</th><th className="px-4 py-3 text-right">Days overdue</th><th className="px-4 py-3 text-right">Overdue amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(defaulters?.students ?? []).map((d) => (
                      <tr key={d.student.id}>
                        <td className="px-5 py-3"><Link href={`/students/${d.student.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">{d.student.fullName}</Link><span className="block text-xs font-mono text-ink-3">{d.student.admissionNo}</span></td>
                        <td className="px-4 py-3 text-xs text-ink-2">{d.student.class ? `${d.student.class.name} ${d.student.class.section ?? ""}` : "—"}</td>
                        <td className="px-4 py-3 text-right tnum">{d.overdue_invoices}</td>
                        <td className="px-4 py-3 text-xs tnum">{formatDate(d.oldest_due)}</td>
                        <td className="px-4 py-3 text-right tnum"><Badge tone={d.days_overdue > 60 ? "rose" : "amber"}>{d.days_overdue} days</Badge></td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-danger-ink">{fmt(d.overdue_amount)}</td>
                      </tr>
                    ))}
                    {(defaulters?.students.length ?? 0) === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-ink-3">No defaulters — every past-due invoice is settled.</td></tr>}
                  </tbody>
                </table>
              </TableView>
            </div>
          </Reveal>
        )}

        {tab === "structures" && staffRead && (
          <Reveal>
            <div className={`grid grid-cols-1 gap-6 max-md:gap-4 ${canWrite ? "lg:grid-cols-3" : ""}`}>
              <div className={`${canWrite ? "lg:col-span-2" : ""} rounded-xl border border-line bg-white shadow-soft overflow-hidden`}>
                <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
                  <div className="relative min-w-[180px] flex-1">
                    <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                    <Input
                      type="search"
                      value={structureSearch}
                      onChange={(e) => setStructureSearch(e.target.value)}
                      placeholder="Search fee head or class…"
                      aria-label="Search fee structure"
                      className="!pl-9"
                    />
                  </div>
                  <Select
                    aria-label="Filter fee structure by class"
                    value={structureClassFilter}
                    onChange={(e) => setStructureClassFilter(e.target.value)}
                    className="w-auto max-md:!w-full"
                  >
                    <option value="">All classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Filter fee structure by fee head"
                    value={structureHeadFilter}
                    onChange={(e) => setStructureHeadFilter(e.target.value)}
                    className="w-auto max-md:!w-full"
                  >
                    <option value="">All fee heads</option>
                    {uniqueFeeHeads.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                  {(structureClassFilter || structureHeadFilter || structureSearch.trim()) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setStructureClassFilter("");
                        setStructureHeadFilter("");
                        setStructureSearch("");
                      }}
                    >
                      Clear filter
                    </Button>
                  )}
                </div>
                <TableView id="fees-structures">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-surface-2/70 border-b border-line">
                      <tr className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">
                        <th className="px-5 py-3">Class</th><th className="px-4 py-3">Fee head</th><th className="px-4 py-3 text-right">Amount</th>{canWrite && <th className="px-4 py-3 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filteredStructures.map((st) => (
                        <tr key={st.id}>
                          <td className="px-5 py-3 text-xs text-ink-2">{st.class.name} {st.class.section ?? ""}</td>
                          <td className="px-4 py-3 font-semibold text-ink">{st.feeType}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmt(st.amount)}</td>
                          {canWrite && (
                            <td className="px-4 py-3 text-right">
                              <Button size="sm" variant="ghost" onClick={() => removeStructure(st.id)} aria-label={`Remove ${st.feeType}`}><Icon name="trash" className="h-3.5 w-3.5" /></Button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {filteredStructures.length === 0 && <tr><td colSpan={canWrite ? 4 : 3} className="px-4 py-12 text-center text-ink-3">{structures.length === 0 ? "No fee structures defined" : "No fee structures match the current filter"}</td></tr>}
                    </tbody>
                  </table>
                </TableView>
              </div>
              {canWrite && (
                <div className="rounded-xl border border-line bg-white shadow-sm p-6 h-fit max-md:p-4">
                  <h3 className="font-semibold text-ink mb-4">Add fee head</h3>
                  <div className="space-y-4">
                    <Select value={stClass} onChange={(e) => setStClass(e.target.value)} aria-label="Class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}</Select>
                    <Input value={stType} onChange={(e) => setStType(e.target.value)} placeholder="Fee head, e.g. Tuition" aria-label="Fee head" />
                    <Input type="number" value={stAmount} onChange={(e) => setStAmount(e.target.value)} placeholder="Amount" aria-label="Amount" />
                    <Button variant="primary" onClick={addStructure} className="w-full"><Icon name="plus" className="h-4 w-4" /> Add</Button>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
