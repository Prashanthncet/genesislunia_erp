"use client";

import { useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, useToast } from "@/components/ui";
import { errMsg, inr, slipTone, type Payslip, type StaffRow, totalDeductions } from "./types";

type Me = StaffRow & { salaryStructure: { basicSalary: number; hra: number; da: number } | null };

/** Every staff member's own profile and released payslips. */
export function MyPayslipsPanel() {
  const toast = useToast();
  const { me: session, loading: sessionLoading } = useMe();
  const [me, setMe] = useState<Me | null>(null);
  const [slips, setSlips] = useState<Payslip[] | null>(null);
  const [noProfile, setNoProfile] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    // Admin logins often have no staff record: say so instead of asking the API for one.
    if (!session?.staff) {
      setNoProfile(true);
      return;
    }
    apiFetch<Me>("/api/staff/me").then(setMe).catch(() => setNoProfile(true));
    apiFetch<Payslip[]>("/api/staff/me/payslips").then(setSlips).catch((e) => { setSlips([]); toast.push(errMsg(e), "error"); });
  }, [toast, session, sessionLoading]);

  if (noProfile) return <EmptyState title="Your login is not linked to a staff record" hint="Ask HR to link your account to get payslips here." icon="staff" />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4">
        <CardHead title="My profile" icon="user" />
        {me ? (
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-ink-3">Name</dt><dd className="font-semibold">{me.name}</dd></div>
            <div><dt className="text-xs text-ink-3">Designation · Department</dt><dd>{me.role} · {me.department ?? "—"}</dd></div>
            <div><dt className="text-xs text-ink-3">Email · Phone</dt><dd>{me.email} · {me.phone ?? "—"}</dd></div>
            {me.salaryStructure && <div><dt className="text-xs text-ink-3">Basic / HRA / DA</dt><dd className="tnum">{inr(me.salaryStructure.basicSalary)} / {inr(me.salaryStructure.hra)} / {inr(me.salaryStructure.da)}</dd></div>}
          </dl>
        ) : <p className="text-sm text-ink-3">Loading…</p>}
      </Card>
      <Card className="p-4 lg:col-span-2">
        <CardHead title="My payslips" icon="receipt" />
        {!slips ? <p className="text-sm text-ink-3">Loading…</p> : slips.length === 0 ? <EmptyState title="No payslips released yet" icon="receipt" /> : (
          <ul className="space-y-1.5 text-sm">
            {slips.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2/70 px-3 py-2">
                <div>
                  <span className="tnum font-semibold">{p.monthYear}</span>{" "}
                  <span className="text-xs text-ink-3">Gross {inr(p.grossSalary)} · Deductions {inr(totalDeductions(p))} (TDS {inr(p.tdsDeduction)} · PT {inr(p.professionalTax ?? 0)} · EPF {inr(p.epfDeduction)}){p.unpaidDays ? ` (incl. ${p.unpaidDays} unpaid day(s))` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tnum font-bold">{inr(p.netSalary)}</span>
                  <Badge tone={slipTone(p.status)}>{p.status}</Badge>
                  <Button size="sm" onClick={() => apiDownload(`/api/staff/payslips/${p.id}/pdf`, `payslip-${p.monthYear}.pdf`).catch((e) => toast.push(errMsg(e), "error"))}>PDF</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
