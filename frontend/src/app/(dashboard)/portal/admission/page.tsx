"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth";
import { inr } from "@/lib/format";
import { Badge, Card, CardHead, EmptyState, Icon, PageHeader } from "@/components/ui";
import { PanelState, fmtDay } from "@/components/portal/bits";

type Application = {
  id: string;
  student_name: string | null;
  status: string;
  class: { id: string; name: string; section: string | null } | null;
  roll_no: string | null;
  house: string | null;
  payment_status: string;
  fee_amount: number | null;
  receipt_no: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  academic_year: string | null;
  student_id: string | null;
  remarks: string | null;
  created_at: string;
  confirmed: boolean;
  timeline: { id: string; from_status: string | null; to_status: string; action: string; actor_role: string | null; remarks: string | null; at: string }[];
};

/** The plan's status sequence, in order. Shown as a stepper; the current one is highlighted. */
const STEPS = [
  "Links Sent",
  "Submitted by Parent",
  "Document Validated",
  "Payment Received",
  "Fee Approved",
  "Roll No Assigned",
  "VP Approved",
  "Admission Complete",
];
const STEP_LABEL: Record<string, string> = {
  "Links Sent": "Form link sent",
  "Submitted by Parent": "Form submitted",
  "Document Validated": "Documents checked",
  "Payment Received": "Fee paid",
  "Fee Approved": "Fee verified",
  "Roll No Assigned": "Roll no. & house",
  "VP Approved": "Vice Principal approved",
  "Admission Complete": "Admission confirmed",
};

function stepIndex(status: string): number {
  if (status === "Admission Confirmed") return STEPS.length - 1;
  if (status === "Re-submit") return 1;
  return STEPS.indexOf(status);
}

/** Plan Phase 2: the screen a parent sees once the admission is confirmed. */
function Confirmed({ app }: { app: Application }) {
  return (
    <section className="overflow-hidden rounded-panel border border-ok-line bg-surface shadow-card">
      <div className="flex flex-col items-center gap-3 bg-ok-soft px-5 py-8 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ok text-white shadow-lift">
          <Icon name="check" className="h-8 w-8" />
        </span>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ok-ink">Admission confirmed</p>
        <h2 className="font-display text-[24px] font-extrabold leading-tight text-ink">
          Welcome to the school{app.student_name ? `, ${app.student_name}` : ""}!
        </h2>
        <p className="max-w-md text-[13px] text-ink-2">
          Every step of the admission is complete. The school will share joining details and the first-day schedule with you.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <div><dt className="label">Class</dt><dd className="text-[14px] font-semibold text-ink">{app.class ? `${app.class.name}${app.class.section ? ` ${app.class.section}` : ""}` : "—"}</dd></div>
        <div><dt className="label">Roll number</dt><dd className="text-[14px] font-semibold tnum text-ink">{app.roll_no ?? "—"}</dd></div>
        <div><dt className="label">House</dt><dd className="text-[14px] font-semibold text-ink">{app.house ?? "—"}</dd></div>
        <div><dt className="label">Fee receipt</dt><dd className="text-[14px] font-semibold text-ink">{app.receipt_no ?? "—"}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
        <Link href="/portal" className="btn-primary">
          <Icon name="home" className="h-4 w-4" />
          Go to my child&apos;s dashboard
        </Link>
      </div>
    </section>
  );
}

function ApplicationCard({ app }: { app: Application }) {
  const idx = stepIndex(app.status);
  return (
    <Card>
      <CardHead
        icon="admissions"
        title={app.student_name ?? "Admission application"}
        subtitle={[app.academic_year, `applied ${fmtDay(app.created_at)}`].filter(Boolean).join(" · ")}
        actions={<Badge tone={app.confirmed ? "emerald" : app.status === "Re-submit" ? "rose" : "amber"}>{app.status}</Badge>}
      />
      {app.status === "Re-submit" && (
        <p className="mx-4 mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger-ink sm:mx-5">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          The school asked you to correct and re-submit the form{app.remarks ? `: ${app.remarks}` : "."} Use the form link the school sent you.
        </p>
      )}
      <ol className="space-y-0 p-4 sm:p-5" aria-label="Admission progress">
        {STEPS.map((s, i) => {
          const done = i < idx || (i === idx && app.confirmed);
          const current = i === idx && !app.confirmed;
          const event = [...app.timeline].reverse().find((t) => t.to_status === s);
          return (
            <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
              {i < STEPS.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 ${done ? "bg-ok" : "bg-line"}`} aria-hidden />}
              <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                done ? "bg-ok text-white" : current ? "bg-brand-700 text-white ring-4 ring-brand-100" : "bg-surface-2 text-ink-3 ring-1 ring-line"
              }`}>
                {done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`text-[13px] font-semibold ${done || current ? "text-ink" : "text-ink-3"}`}>
                  {STEP_LABEL[s]}
                  {current && <span className="ml-2 text-[11px] font-medium text-brand-600">in progress</span>}
                </p>
                {event && (
                  <p className="text-[11.5px] text-ink-3">
                    {fmtDay(event.at)}{event.actor_role ? ` · ${ROLE_LABEL[event.actor_role] ?? event.actor_role}` : ""}
                    {event.remarks ? ` · ${event.remarks}` : ""}
                  </p>
                )}
                {s === "Payment Received" && app.fee_amount != null && (
                  <p className="text-[11.5px] text-ink-3">Admission fee {inr(app.fee_amount)} · {app.payment_status}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default function PortalAdmissionPage() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    apiFetch<Application[]>("/api/portal/admission")
      .then(setApps)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your application"));
  };
  useEffect(load, []);

  const confirmed = apps?.find((a) => a.confirmed);
  return (
    <div className="space-y-4">
      <PageHeader icon="admissions" title="Admission status" subtitle="Where your application is, step by step." />
      {error && (
        <Card>
          <PanelState loading={false} error={error} reload={load} />
        </Card>
      )}
      {!apps && !error && <PanelState loading error={null} />}
      {apps && apps.length === 0 && (
        <Card>
          <EmptyState
            icon="admissions"
            title="No admission application on this login"
            hint="Applications you submit through the school's admission link will show their progress here."
            action={<Link href="/portal" className="btn-soft">Back to dashboard</Link>}
          />
        </Card>
      )}
      {confirmed && <Confirmed app={confirmed} />}
      {apps?.map((a) => <ApplicationCard key={a.id} app={a} />)}
    </div>
  );
}
