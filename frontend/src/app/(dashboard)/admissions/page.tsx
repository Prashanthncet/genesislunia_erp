"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, hasRole, useMe } from "@/lib/auth";
import { Badge, Button, EmptyState, Icon, Input, PageHeader, Reveal, Select, SkeletonRows, StatCard, Tabs, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { ApplicationPanel } from "@/components/admissions/ApplicationPanel";
import { CreateForms } from "@/components/admissions/CreateForms";
import { TemplateApprovals, TemplateBuilder } from "@/components/admissions/TemplateBuilder";
import { Application, PIPELINE, STATUS_TONE, fmtDate, inr, post } from "@/components/admissions/shared";

type TabId =
  | "template" | "create" | "submitted" | "approvals" | "fee-approved"
  | "payment-received" | "awaiting-payment" | "roll-assigned" | "vp-approved" | "all";

/** Role-driven work queues: each role sees the step it owns, plus the full list. */
const QUEUES: { id: TabId; label: string; roles: readonly string[]; status?: string; hint?: string }[] = [
  { id: "template", label: "Form template", roles: R.ADMISSION_SETUP },
  { id: "create", label: "Create admission forms", roles: R.ADMISSION_SETUP },
  { id: "submitted", label: "Submitted — validate", roles: R.ADMISSION_SETUP, status: "Submitted by Parent", hint: "Check the form and documents; mark valid or send back for re-submission." },
  { id: "approvals", label: "Template approvals", roles: R.ADMISSION_OS },
  { id: "fee-approved", label: "Fee approved — assign roll", roles: R.ADMISSION_OS, status: "Fee Approved", hint: "Generate the roll number ([CLASS]-[YEAR]-[SEQ]) and balanced house." },
  { id: "payment-received", label: "Payment received — verify", roles: R.ADMISSION_ACCOUNTS, status: "Payment Received", hint: "Verify the payment, enter or generate the receipt number, attach the receipt." },
  { id: "awaiting-payment", label: "Awaiting payment", roles: R.ADMISSION_ACCOUNTS, status: "Document Validated", hint: "Parents pay online; record counter/cheque payments here with a reference." },
  { id: "roll-assigned", label: "VP review", roles: R.ADMISSION_VP, status: "Roll No Assigned", hint: "Approve, or send back to the OS with remarks." },
  { id: "vp-approved", label: "Principal sign-off", roles: R.ADMISSION_PRINCIPAL, status: "VP Approved", hint: "Digitally sign to confirm; the student record is created immediately." },
  { id: "all", label: "All applications", roles: R.ADMISSION_READ },
];

export default function AdmissionsPage() {
  const { me, loading: meLoading } = useMe();
  const toast = useToast();
  const notify = useCallback((msg: string, tone: "success" | "error" = "success") => toast.push(msg, tone), [toast]);

  const tabs = useMemo(() => QUEUES.filter((q) => hasRole(me, q.roles)), [me]);
  const [tab, setTab] = useState<TabId | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setApps(await apiFetch<Application[]>("/api/admissions"));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load applications", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { if (hasRole(me, R.ADMISSION_READ)) void load(); }, [me, load]);
  useEffect(() => {
    if (!tab && tabs.length) {
      // Start on the first queue that has work in it, else the first tab.
      const busy = tabs.find((t) => t.status && apps.some((a) => a.status === t.status));
      setTab((busy ?? tabs[0]).id);
    }
  }, [tabs, tab, apps]);

  if (meLoading) return <div className="card p-6"><SkeletonRows rows={4} cols={3} /></div>;
  if (!hasRole(me, R.ADMISSION_READ)) {
    return (
      <div className="card">
        <EmptyState icon="lock" title="You don't have access to this page" hint="Admissions are handled by the admission office, OS, accounts and school leadership." />
      </div>
    );
  }

  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const count = (status: string) => apps.filter((a) => a.status === status).length;
  const complete = count("Admission Complete");
  const inFlight = apps.filter((a) => !["Admission Complete", "Rejected", "Link Expired"].includes(a.status)).length;

  const rows = apps.filter((a) => {
    if (current?.status && a.status !== current.status) return false;
    if (current?.id === "all" && statusFilter && a.status !== statusFilter) return false;
    if (q) {
      const hay = `${a.studentName ?? ""} ${a.parentName ?? ""} ${a.parentEmail ?? ""} ${a.loginId ?? ""} ${a.rollNo ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const runReminders = async () => {
    setRunning(true);
    try {
      const r = await post<{ checked: number; reminded_day7: number; reminded_day13: number; expired: number }>("/api/admissions/reminders/run");
      notify(`Checked ${r.checked}: ${r.reminded_day7} day-7 and ${r.reminded_day13} day-13 reminders, ${r.expired} links expired`);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Reminder run failed", "error");
    } finally {
      setRunning(false);
    }
  };

  const queueTable = (
    <div className="space-y-3">
      {current?.hint && <p className="text-[13px] text-ink-3">{current.hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search applications" placeholder="Search name, email, login ID, roll no…" value={q} onChange={(e) => setQ(e.target.value)} className="field flex-1 min-w-56" />
        {current?.id === "all" && (
          <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
            <option value="">All statuses</option>
            {[...PIPELINE, "Re-submit", "Link Expired", "Rejected"].map((s) => <option key={s}>{s}</option>)}
          </Select>
        )}
        {hasRole(me, R.ADMISSION_SETUP) && current?.id === "all" && (
          <Button variant="soft" loading={running} onClick={runReminders}><Icon name="bell" className="h-4 w-4" /> Run reminders now</Button>
        )}
        <Button variant="ghost" onClick={() => void load()}><Icon name="refresh" className="h-4 w-4" /> Refresh</Button>
      </div>
      <div className="card overflow-x-auto">
        <TableView id={`queue-${current?.id ?? "all"}`}>
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Roll / House</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Open</th>
              </tr>
            </thead>
            {loading ? <SkeletonRows rows={4} cols={7} /> : (
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="row-hover border-t border-line">
                    <td className="px-4 py-3">
                      <span className="block font-semibold">{a.studentName ?? "Not submitted yet"}</span>
                      <span className="text-[11.5px] text-ink-3">{a.academicYear ?? "—"}{a.class ? ` · ${a.class.name}${a.class.section ? `-${a.class.section}` : ""}` : ""}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{a.parentName ?? "—"}</span>
                      <span className="font-mono text-[11.5px] text-ink-3">{a.loginId ?? ""}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[a.status] ?? "sky"}>{a.status}</Badge>
                      {a.status === "Links Sent" && a.linkExpiresAt && (
                        <span className="mt-0.5 block text-[11px] text-ink-3">expires {fmtDate(a.linkExpiresAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{a.paymentStatus} · {inr(a.feeAmount)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.rollNo ?? "—"}{a.house ? ` / ${a.house}` : ""}</td>
                    <td className="px-4 py-3 text-xs text-ink-3">{fmtDate(a.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant={current?.status ? "primary" : "soft"} onClick={() => setOpenId(a.id)}>
                        {current?.status ? "Review" : "Open"} <Icon name="chevronRight" className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </TableView>
        {!loading && rows.length === 0 && (
          <EmptyState icon="check" title={current?.status ? "Queue is clear" : "No applications"} hint={current?.status ? `Nothing is waiting in “${current.status}”.` : undefined} />
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader icon="admissions" title="Admissions"
          subtitle="AO → Parent → AO → Payment → Accounts → OS → VP → Principal. Each role sees the queue it owns." />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}><StatCard label="Applications" value={apps.length} tone="brand" icon="admissions" /></Reveal>
        <Reveal delay={80}><StatCard label="In progress" value={inFlight} tone="amber" icon="spark" /></Reveal>
        <Reveal delay={120}><StatCard label="Completed" value={complete} tone="emerald" icon="check" /></Reveal>
        <Reveal delay={160}><StatCard label="Awaiting payment" value={count("Document Validated")} tone="sky" icon="wallet" /></Reveal>
      </div>

      <Reveal delay={60}>
        <Tabs value={current?.id ?? "all"} onChange={(id) => { setTab(id); setQ(""); }}
          tabs={tabs.map((t) => ({ id: t.id, label: t.label, ...(t.status ? { count: count(t.status) } : {}) }))} />
      </Reveal>

      <div key={current?.id} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {current?.id === "template" && <TemplateBuilder notify={notify} />}
        {current?.id === "create" && <CreateForms notify={notify} onCreated={() => void load()} />}
        {current?.id === "approvals" && <TemplateApprovals notify={notify} />}
        {current && !["template", "create", "approvals"].includes(current.id) && queueTable}
      </div>

      {openId && <ApplicationPanel id={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} notify={notify} />}
    </div>
  );
}
