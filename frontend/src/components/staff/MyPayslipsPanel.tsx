"use client";

import { useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Icon, SkeletonRows, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Metric, RecordCard, StatusPill, statusTone } from "@/components/RecordCard";
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

  const download = (p: Payslip) =>
    apiDownload(`/api/staff/payslips/${p.id}/pdf`, `payslip-${p.monthYear}.pdf`).catch((e) => toast.push(errMsg(e), "error"));

  const myCards = (
    <CardGrid min="17rem" empty={<CardEmpty title="No payslips released yet" hint="Payslips appear here once payroll releases them." icon="receipt" />}>
      {(slips ?? []).map((p) => (
        <RecordCard key={p.id} rail={statusTone(p.status)}>
          <CardBody>
            <CardTitle title={<span className="tnum">{p.monthYear}</span>} subtitle={p.unpaidDays ? `incl. ${p.unpaidDays} unpaid day(s)` : "Monthly payslip"} aside={<StatusPill status={p.status} />} />
            <div className="flex items-end justify-between gap-3 rounded-lg bg-surface-2 px-3.5 py-3">
              <Metric label="Net pay" value={inr(p.netSalary)} size="lg" />
              <Metric label="Gross" value={inr(p.grossSalary)} align="right" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="TDS" value={inr(p.tdsDeduction)} />
              <Metric label="PT" value={inr(p.professionalTax ?? 0)} />
              <Metric label="EPF" value={inr(p.epfDeduction)} />
            </div>
          </CardBody>
          <CardFooter>
            <Button type="button" size="sm" variant="ghost" onClick={() => download(p)} aria-label={`Download payslip PDF for ${p.monthYear}`}>
              <Icon name="download" className="h-3.5 w-3.5" /> PDF
            </Button>
          </CardFooter>
        </RecordCard>
      ))}
    </CardGrid>
  );

  if (noProfile) return <EmptyState title="Your login is not linked to a staff record" hint="Ask HR to link your account to get payslips here." icon="staff" />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4">
        <CardHead title="My profile" icon="user" />
        {me ? (
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-ink-3">Name</dt><dd className="font-semibold">{me.name}</dd></div>
            <div><dt className="text-xs text-ink-3">Designation · Department</dt><dd>{me.role} · {me.department ?? "—"}</dd></div>
            <div><dt className="text-xs text-ink-3">Email · Phone</dt><dd className="max-md:[overflow-wrap:anywhere]">{me.email} · {me.phone ?? "—"}</dd></div>
            {me.salaryStructure && <div><dt className="text-xs text-ink-3">Basic / HRA / DA</dt><dd className="tnum">{inr(me.salaryStructure.basicSalary)} / {inr(me.salaryStructure.hra)} / {inr(me.salaryStructure.da)}</dd></div>}
          </dl>
        ) : <p className="text-sm text-ink-3">Loading…</p>}
      </Card>
      <Card className="min-w-0 p-4 lg:col-span-2">
        <CardHead title="My payslips" icon="receipt" subtitle={slips ? `${slips.length} released` : undefined} />
        <TableView id="my-payslips" cards={slips ? myCards : undefined}>
          <div className="table-wrap max-h-[70vh] rounded-xl border border-line">
            <table className="data-table min-w-[44rem]">
              <thead>
                <tr>
                  <th>Month</th><th className="th-end">Gross</th><th className="th-end">Deductions</th><th className="th-end">Net pay</th>
                  <th>Status</th><th className="th-end">Actions</th>
                </tr>
              </thead>
              {!slips ? <SkeletonRows rows={4} cols={6} /> : (
                <tbody>
                  {slips.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="tnum block font-semibold text-ink">{p.monthYear}</span>
                        {p.unpaidDays > 0 && <span className="block text-[11px] text-ink-3">incl. {p.unpaidDays} unpaid day{p.unpaidDays === 1 ? "" : "s"}</span>}
                      </td>
                      <td className="td-end tnum whitespace-nowrap">{inr(p.grossSalary)}</td>
                      <td className="td-end tnum whitespace-nowrap">
                        {inr(totalDeductions(p))}
                        <span className="block text-[11px] text-ink-3">TDS {inr(p.tdsDeduction)} · PT {inr(p.professionalTax ?? 0)} · EPF {inr(p.epfDeduction)}</span>
                      </td>
                      <td className="td-end tnum whitespace-nowrap font-bold text-ink">{inr(p.netSalary)}</td>
                      <td><Badge tone={slipTone(p.status)}>{p.status}</Badge></td>
                      <td className="td-end">
                        <div className="flex justify-end">
                          <Button type="button" size="sm" variant="ghost" onClick={() => download(p)} aria-label={`Download payslip PDF for ${p.monthYear}`}>
                            <Icon name="download" className="h-3.5 w-3.5" /> PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {slips.length === 0 && (
                    <tr><td colSpan={6}><EmptyState title="No payslips released yet" hint="Payslips appear here once payroll releases them." icon="receipt" /></td></tr>
                  )}
                </tbody>
              )}
            </table>
          </div>
        </TableView>
      </Card>
    </div>
  );
}
