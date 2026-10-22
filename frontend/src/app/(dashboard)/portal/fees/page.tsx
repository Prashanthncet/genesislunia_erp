"use client";

import { useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { inr } from "@/lib/format";
import { Button, Card, CardHead, EmptyState, Icon, Modal, PageHeader, StatCard, useToast } from "@/components/ui";
import { PortalPage, usePortal, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState, StatusBadge, fmtDay } from "@/components/portal/bits";

type Fees = {
  invoices: {
    id: string;
    invoice_no: string | null;
    term: string;
    total_amount: number;
    due_date: string;
    status: string;
    paid_amount: number;
    balance: number;
    overdue: boolean;
    payments: { id: string; amount: number; mode: string; date: string; receipt_no: string | null; receipt_url: string }[];
  }[];
  total: number;
  paid: number;
  balance: number;
};

type Order = { id: string; order_id: string; gateway: "mock" | "razorpay"; amount: number; currency: string };

/** A 404 from a route that doesn't exist yet (built by another module) — not a real failure. */
const notReady = (msg: string) => /cannot (get|post)|not found/i.test(msg) && !/invoice not found/i.test(msg);

function FeesBody({ child }: { child: PortalChild }) {
  const toast = useToast();
  const { reload: reloadOverview } = usePortal();
  const { data, error, loading, reload } = useChildData<Fees>(child.id, "fees");
  const [paying, setPaying] = useState<string | null>(null);
  const [order, setOrder] = useState<(Order & { invoice: string }) | null>(null);
  const [completing, setCompleting] = useState(false);

  const pay = async (invoiceId: string, label: string) => {
    setPaying(invoiceId);
    try {
      const o = await apiFetch<Order>("/api/payments/orders", {
        method: "POST",
        body: JSON.stringify({ purpose: "invoice", ref_id: invoiceId }),
      });
      if (o.gateway === "mock") setOrder({ ...o, invoice: label });
      else toast.push("Online card/UPI checkout is being set up. Please pay at the school office for now.", "info");
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

  const receipt = async (url: string, no: string | null) => {
    try {
      await apiDownload(url, `receipt-${no ?? "payment"}.pdf`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      toast.push(notReady(msg) ? "Receipt download isn't available yet. Ask the office for a printed receipt." : msg, notReady(msg) ? "info" : "error");
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total billed" value={data?.total ?? null} prefix="₹" icon="receipt" />
        <StatCard label="Paid" value={data?.paid ?? null} prefix="₹" icon="check" tone="emerald" />
        <StatCard label="Balance due" value={data?.balance ?? null} prefix="₹" icon="wallet" tone={data?.balance ? "amber" : "emerald"} />
      </div>

      <Card>
        <CardHead icon="fees" title="Invoices" subtitle="Pay online or at the school office. Receipts appear under each payment." />
        <PanelState loading={loading} error={error} reload={reload} />
        {data && data.invoices.length === 0 && <EmptyState icon="fees" title="No invoices yet" hint="Fee invoices raised by the school will appear here." />}
        {data && data.invoices.length > 0 && (
          <ul className="divide-y divide-line">
            {data.invoices.map((inv) => (
              <li key={inv.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{inv.term}</p>
                    <p className="text-[12px] text-ink-3">
                      {inv.invoice_no ?? "Invoice"} · due {fmtDay(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.overdue && <StatusBadge status="Overdue" />}
                    <StatusBadge status={inv.balance <= 0 ? "Paid" : inv.status} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <dl className="grid grid-cols-3 gap-4 text-[12px]">
                    <div><dt className="text-ink-3">Amount</dt><dd className="font-semibold tnum text-ink">{inr(inv.total_amount)}</dd></div>
                    <div><dt className="text-ink-3">Paid</dt><dd className="font-semibold tnum text-ink">{inr(inv.paid_amount)}</dd></div>
                    <div><dt className="text-ink-3">Balance</dt><dd className={`font-bold tnum ${inv.balance > 0 ? "text-danger" : "text-ok"}`}>{inr(inv.balance)}</dd></div>
                  </dl>
                  {inv.balance > 0 && (
                    <Button
                      variant="primary"
                      className="w-full sm:w-auto"
                      loading={paying === inv.id}
                      onClick={() => pay(inv.id, `${inv.term} (${inv.invoice_no ?? "invoice"})`)}
                    >
                      <Icon name="wallet" className="h-4 w-4" />
                      Pay {inr(inv.balance)}
                    </Button>
                  )}
                </div>
                {inv.payments.length > 0 && (
                  <ul className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3">
                    {inv.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                        <span className="text-ink-2">
                          {fmtDay(p.date)} · {p.mode} · <span className="font-semibold tnum text-ink">{inr(p.amount)}</span>
                          {p.receipt_no ? ` · ${p.receipt_no}` : ""}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => receipt(p.receipt_url, p.receipt_no)}>
                          <Icon name="download" className="h-3.5 w-3.5" />
                          Receipt
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

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
