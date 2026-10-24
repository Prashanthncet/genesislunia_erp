"use client";

import { useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { inr } from "@/lib/format";
import { Button, Card, CardHead, EmptyState, Icon, Modal, PageHeader, StatCard, useToast } from "@/components/ui";
import { PortalPage, usePortal, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState, fmtDay } from "@/components/portal/bits";
import { TableView } from "@/components/TableView";
import { CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Meter, Metric, RecordCard, StatusPill, statusTone } from "@/components/RecordCard";
import { payWithRazorpay, type GatewayOrder } from "@/lib/razorpay";

type Payment = { id: string; amount: number; mode: string; date: string; receipt_no: string | null; reference_no?: string | null; receipt_url: string };
type Invoice = {
  id: string;
  invoice_no: string | null;
  term: string;
  total_amount: number;
  due_date: string;
  status: string;
  paid_amount: number;
  balance: number;
  overdue: boolean;
  payments: Payment[];
};
type Fees = { invoices: Invoice[]; total: number; paid: number; balance: number };

type Order = GatewayOrder & { id: string };

/** A 404 from a route that doesn't exist yet (built by another module) — not a real failure. */
const notReady = (msg: string) => /cannot (get|post)|not found/i.test(msg) && !/invoice not found/i.test(msg);

const statusOf = (inv: Invoice) => (inv.balance <= 0 ? "Paid" : inv.overdue ? "Overdue" : inv.status);

function FeesBody({ child }: { child: PortalChild }) {
  const toast = useToast();
  const { reload: reloadOverview } = usePortal();
  const { data, error, loading, reload } = useChildData<Fees>(child.id, "fees");
  const [paying, setPaying] = useState<string | null>(null);
  const [order, setOrder] = useState<(Order & { invoice: string }) | null>(null);
  const [completing, setCompleting] = useState(false);
  // One busy key per download, so a slow PDF never blocks another button.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const pay = async (invoiceId: string, label: string) => {
    setPaying(invoiceId);
    try {
      const o = await apiFetch<Order>("/api/payments/orders", {
        method: "POST",
        body: JSON.stringify({ purpose: "invoice", ref_id: invoiceId }),
      });
      if (o.gateway === "mock") {
        setOrder({ ...o, invoice: label });
        return;
      }
      const result = await payWithRazorpay(o, {
        name: "School fees",
        description: label,
        prefill: { name: child.full_name },
      });
      if (result.status === "paid") {
        toast.push(`Payment of ${inr(o.amount)} received — your receipt is ready below`, "success");
        reload();
        void reloadOverview();
      } else if (result.status === "failed") {
        toast.push(result.reason, "error");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start the payment";
      toast.push(notReady(msg) ? "Online payment isn't available yet. Please pay at the school office." : msg, notReady(msg) ? "info" : "error");
    } finally {
      setPaying(null);
    }
  };

  const completeMock = async () => {
    if (!order) return;
    setCompleting(true);
    try {
      await apiFetch(`/api/payments/mock/${encodeURIComponent(order.order_id)}/complete`, { method: "POST" });
      toast.push(`Payment of ${inr(order.amount)} recorded`);
      setOrder(null);
      reload();
      void reloadOverview();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Payment failed", "error");
    } finally {
      setCompleting(false);
    }
  };

  const download = async (key: string, url: string, name: string) => {
    setBusy((b) => new Set(b).add(key));
    try {
      await apiDownload(url, name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      toast.push(notReady(msg) ? "This download isn't available yet. Ask the office for a printed copy." : `Download failed: ${msg}`, notReady(msg) ? "info" : "error");
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    }
  };
  const receipt = (p: Payment) => download(`rc-${p.id}`, p.receipt_url, `receipt-${p.receipt_no ?? p.id}.pdf`);
  const invoicePdf = (inv: Invoice) => download(`inv-${inv.id}`, `/api/fees/invoices/${inv.id}/invoice.pdf`, `invoice-${inv.invoice_no ?? inv.id}.pdf`);

  const invoices = data?.invoices ?? [];
  const payments = invoices
    .flatMap((inv) => inv.payments.map((p) => ({ ...p, invoice_no: inv.invoice_no, term: inv.term })))
    .sort((a, b) => b.date.localeCompare(a.date));

  const payButton = (inv: Invoice) => inv.balance > 0 ? (
    <Button type="button" size="sm" variant="primary" loading={paying === inv.id} onClick={() => pay(inv.id, `${inv.term} (${inv.invoice_no ?? "invoice"})`)}>
      <Icon name="wallet" className="h-3.5 w-3.5" /> Pay {inr(inv.balance)}
    </Button>
  ) : null;

  /** Card view: the balance first, then the invoice PDF and one button per receipt. */
  const invoiceCards = (
    <CardGrid min="18rem" empty={<CardEmpty icon="fees" title="No invoices yet" hint="Fee invoices raised by the school will appear here." />}>
      {invoices.map((inv) => {
        const st = statusOf(inv);
        const pct = inv.total_amount > 0 ? Math.round((inv.paid_amount / inv.total_amount) * 100) : 0;
        return (
          <RecordCard key={inv.id} rail={statusTone(st)}>
            <CardBody>
              <CardTitle
                title={inv.term}
                subtitle={<span className="font-mono">{inv.invoice_no ?? "Invoice"} · due {fmtDay(inv.due_date)}</span>}
                aside={<StatusPill status={st} />}
              />
              <div className="grid grid-cols-3 gap-3 rounded-lg bg-surface-2 px-3.5 py-3">
                <Metric label="Amount" value={inr(inv.total_amount)} />
                <Metric label="Paid" value={inr(inv.paid_amount)} tone="ok" />
                <Metric label="Balance" value={inr(inv.balance)} tone={inv.balance > 0 ? "danger" : "ok"} align="right" />
              </div>
              <Meter value={inv.paid_amount} max={Math.max(1, inv.total_amount)} tone={inv.balance <= 0 ? "ok" : inv.paid_amount > 0 ? "warn" : "danger"} label="Paid so far" caption={`${pct}%`} />
            </CardBody>
            <CardFooter>
              {/* z-[2]: above the card's hover glow/border layers (z-index 1). */}
              <div className="relative z-[2] flex w-full flex-wrap items-center justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" loading={busy.has(`inv-${inv.id}`)} onClick={() => invoicePdf(inv)} aria-label={`Download invoice ${inv.invoice_no ?? ""} PDF`}>
                  <Icon name="download" className="h-3.5 w-3.5" /> Invoice PDF
                </Button>
                {inv.payments.map((p) => (
                  <Button key={p.id} type="button" size="sm" variant="ghost" loading={busy.has(`rc-${p.id}`)} onClick={() => receipt(p)} aria-label={`Download receipt ${p.receipt_no ?? ""} PDF`} title={`${p.receipt_no ?? "Receipt"} · ${inr(p.amount)}`}>
                    <Icon name="receipt" className="h-3.5 w-3.5" /> Receipt {fmtDay(p.date)}
                  </Button>
                ))}
                {payButton(inv)}
              </div>
            </CardFooter>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total billed" value={data?.total ?? null} prefix="₹" icon="receipt" />
        <StatCard label="Paid" value={data?.paid ?? null} prefix="₹" icon="check" tone="emerald" />
        <StatCard label="Balance due" value={data?.balance ?? null} prefix="₹" icon="wallet" tone={data?.balance ? "amber" : "emerald"} />
      </div>

      <Card>
        <CardHead icon="fees" title="Invoices" subtitle="Pay online or at the school office. Download the invoice or any receipt as a PDF." />
        <PanelState loading={loading} error={error} reload={reload} />
        {data && (
          <TableView id="portal-fee-invoices" title="Term" cards={invoiceCards}>
            <div className="table-wrap">
              <table className="data-table">
                <thead className="sticky top-0 z-[1] bg-surface-2">
                  <tr>
                    <th>Term</th>
                    <th>Invoice</th>
                    <th>Due</th>
                    <th className="th-end">Amount</th>
                    <th className="th-end">Paid</th>
                    <th className="th-end">Balance</th>
                    <th>Status</th>
                    <th className="th-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="whitespace-nowrap font-semibold text-ink">{inv.term}</td>
                      <td className="whitespace-nowrap font-mono text-[12px] text-ink-2">{inv.invoice_no ?? "—"}</td>
                      <td className={`tnum whitespace-nowrap text-[13px] ${inv.overdue ? "font-semibold text-danger" : "text-ink-2"}`}>{fmtDay(inv.due_date)}</td>
                      <td className="tnum whitespace-nowrap text-right font-semibold text-ink">{inr(inv.total_amount)}</td>
                      <td className="tnum whitespace-nowrap text-right text-ok-ink">{inr(inv.paid_amount)}</td>
                      <td className={`tnum whitespace-nowrap text-right font-bold ${inv.balance > 0 ? "text-danger" : "text-ok"}`}>{inr(inv.balance)}</td>
                      <td className="whitespace-nowrap"><StatusPill status={statusOf(inv)} /></td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button type="button" size="sm" variant="ghost" loading={busy.has(`inv-${inv.id}`)} onClick={() => invoicePdf(inv)} aria-label={`Download invoice ${inv.invoice_no ?? ""} PDF`}>
                            <Icon name="download" className="h-3.5 w-3.5" /> PDF
                          </Button>
                          {payButton(inv)}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan={8}><EmptyState icon="fees" title="No invoices yet" hint="Fee invoices raised by the school will appear here." /></td></tr>
                  )}
                </tbody>
                {invoices.length > 0 && (
                  <tfoot>
                    <tr className="bg-surface-2/60 font-semibold">
                      <td colSpan={3} className="px-4 py-3 text-ink-2">Total</td>
                      <td className="tnum px-4 py-3 text-right text-ink">{inr(data.total)}</td>
                      <td className="tnum px-4 py-3 text-right text-ok-ink">{inr(data.paid)}</td>
                      <td className={`tnum px-4 py-3 text-right ${data.balance > 0 ? "text-danger" : "text-ok"}`}>{inr(data.balance)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </TableView>
        )}
      </Card>

      {data && payments.length > 0 && (
        <Card>
          <CardHead icon="receipt" title="Payments & receipts" subtitle={`${payments.length} payment${payments.length === 1 ? "" : "s"} recorded`} />
          <TableView id="portal-fee-payments" title="Receipt">
            <div className="table-wrap">
              <table className="data-table">
                <thead className="sticky top-0 z-[1] bg-surface-2">
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Invoice</th>
                    <th>Mode</th>
                    <th className="th-end">Amount</th>
                    <th className="th-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap font-mono text-[12px] font-semibold text-ink">{p.receipt_no ?? "—"}</td>
                      <td className="tnum whitespace-nowrap text-[13px] text-ink-2">{fmtDay(p.date)}</td>
                      <td className="whitespace-nowrap text-[13px] text-ink-2">{p.term}<span className="block font-mono text-[11.5px] text-ink-3">{p.invoice_no ?? ""}</span></td>
                      <td className="whitespace-nowrap text-[13px] text-ink-2">{p.mode}{p.reference_no ? <span className="block font-mono text-[11.5px] text-ink-3">{p.reference_no}</span> : null}</td>
                      <td className="tnum whitespace-nowrap text-right font-semibold text-ink">{inr(p.amount)}</td>
                      <td className="whitespace-nowrap text-right">
                        <Button type="button" size="sm" variant="ghost" loading={busy.has(`rc-${p.id}`)} onClick={() => receipt(p)} aria-label={`Download receipt ${p.receipt_no ?? ""} PDF`}>
                          <Icon name="download" className="h-3.5 w-3.5" /> Receipt PDF
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableView>
        </Card>
      )}

      <Modal
        open={!!order}
        onClose={() => setOrder(null)}
        title="Confirm test payment"
        subtitle="This school is running the payment sandbox — no real money moves."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOrder(null)}>Cancel</Button>
            <Button variant="primary" loading={completing} onClick={completeMock}>
              <Icon name="check" className="h-4 w-4" />
              Pay {order ? inr(order.amount) : ""}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">
          Paying <span className="font-semibold text-ink">{order ? inr(order.amount) : ""}</span> for {order?.invoice}.
          The receipt will appear here once the payment is confirmed.
        </p>
      </Modal>
    </>
  );
}

export default function PortalFeesPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="fees" title="Fees" subtitle="What has been billed, what is paid, and what is due." />
      <PortalPage>{(child) => <FeesBody key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
