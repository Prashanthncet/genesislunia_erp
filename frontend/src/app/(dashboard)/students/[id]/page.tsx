"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import {
  Badge, Button, Card, CardHead, EmptyState, Icon, MailLink, PageHeader, PhoneLink, ProgressBar, Skeleton, StatCard, Tabs, useToast,
} from "@/components/ui";
import { TableView } from "@/components/TableView";
import { DocLink, docHref } from "@/components/admissions/shared";

/** Shape of GET /api/students/:id/profile (sections the role can't see are null). */
type Profile = {
  student: {
    id: string; admission_no: string; full_name: string; dob: string | null; gender: string | null;
    blood_group: string | null; status: string; enrollment_date: string | null;
    class: { id: string; name: string; section: string | null } | null; class_label: string; section: string | null;
    roll_no: string | null; house: string | null; height_cm: number | null; weight_kg: number | null; vision: string | null;
  };
  parents: {
    father_name: string | null; mother_name: string | null; mobile_number: string | null; email: string | null;
    linked_accounts: { name: string | null; relation: string; email: string | null }[];
  };
  attendance: {
    percentage: number | null; records_counted: number; present: number; absent: number; late: number;
    recent: { date: string; status: string }[];
  };
  fees: null | {
    as_of: string; invoiced: number; paid: number; balance: number; overdue_amount: number; overdue_count: number;
    invoices: { id: string; invoice_no: string | null; term: string; due_date: string; status: string; total: number; paid: number; balance: number; overdue: boolean }[];
    payments: { id: string; receipt_no: string | null; invoice_no: string | null; date: string; amount: number; mode: string; online: boolean; reference_no: string | null }[];
  };
  academics: { recent_marks: { exam_id: string; exam: string; date: string; term: string | null; subject: string; score: number; max_score: number; percentage: number | null }[] };
  hostel: { hostel: string; room: string; bed: string | null } | null;
  documents: null | { id: string; doc_type: string; file_name: string; size_bytes: number; created_at: string }[];
  visibility: { contacts: boolean; fees: boolean; documents: boolean };
};

type TabId = "overview" | "attendance" | "fees" | "academics" | "documents";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const statusTone = (s: string) => (s === "Present" ? "emerald" : s === "Late" ? "amber" : "rose");

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className="text-right text-[13.5px] font-semibold text-ink">{value ?? "—"}</dd>
    </div>
  );
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { me, loading: meLoading } = useMe();
  const toast = useToast();
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState("");

  const canRead = hasRole(me, R.STUDENT_READ) || isPortal(me);
  const canExport = hasRole(me, R.STUDENT_WRITE);

  useEffect(() => {
    if (!id || !canRead) return;
    apiFetch<Profile>(`/api/students/${id}/profile`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the profile"));
  }, [id, canRead]);

  const download = async (key: string, path: string, name: string) => {
    setBusy(key);
    try {
      await apiDownload(path, name);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Download failed", "error");
    } finally {
      setBusy("");
    }
  };

  /** DMS documents: ask for a short-lived signed URL, then let the browser fetch the file directly. */
  const openDocument = async (docId: string, name: string) => {
    setBusy(`doc-${docId}`);
    try {
      const link = await apiFetch<DocLink>(`/api/students/${id}/documents/${docId}/url`);
      const href = docHref(link);
      if (!href) throw new Error("Document content is unavailable");
      const a = document.createElement("a");
      a.href = href;
      a.download = link.file_name || name;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Download failed", "error");
    } finally {
      setBusy("");
    }
  };

  if (!meLoading && me && !canRead) {
    return <div className="card"><EmptyState icon="lock" title="You don't have access to this page" /></div>;
  }
  if (error) {
    return (
      <div className="card">
        <EmptyState icon="alert" title="Profile unavailable" hint={error}
          action={!isPortal(me) ? <Link href="/students" className="btn-soft">Back to students</Link> : undefined} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-80" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const s = data.student;
  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "attendance" as const, label: "Attendance", count: data.attendance.records_counted },
    ...(data.fees ? [{ id: "fees" as const, label: "Fees", count: data.fees.invoices.length }] : []),
    { id: "academics" as const, label: "Academics", count: data.academics.recent_marks.length },
    ...(data.documents ? [{ id: "documents" as const, label: "Documents", count: data.documents.length }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon="students"
        eyebrow={isPortal(me) ? "Student profile" : "Student Master · read-only"}
        title={s.full_name}
        subtitle={`${s.class_label || "No class"} · Admission ${s.admission_no}${s.roll_no ? ` · Roll ${s.roll_no}` : ""}`}
        actions={
          <>
            {!isPortal(me) && <Link href="/students" className="btn-ghost"><Icon name="chevronLeft" className="h-4 w-4" /> Students</Link>}
            {canExport && s.status === "Active" && (
              <Button loading={busy === "id"} onClick={() => download("id", `/api/students/${s.id}/export/id-card.pdf`, `ID-${s.admission_no}.pdf`)}>
                <Icon name="user" className="h-4 w-4" /> ID card
              </Button>
            )}
            {canExport && s.status !== "Active" && (
              <Button variant="primary" loading={busy === "tc"} onClick={() => download("tc", `/api/students/${s.id}/export/tc.pdf`, `TC-${s.admission_no}.pdf`)}>
                <Icon name="file" className="h-4 w-4" /> Transfer certificate
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Attendance" value={data.attendance.percentage} suffix="%" decimals={1} icon="attendance" tone="emerald"
          hint={`${data.attendance.records_counted} days recorded`} />
        <StatCard label="House" value={null} icon="flag" tone="sky" hint={s.house ?? "Not assigned"} />
        {data.fees
          ? <StatCard label="Fee balance" value={data.fees.balance} prefix="₹" icon="wallet" tone={data.fees.overdue_count ? "rose" : "brand"}
            hint={data.fees.overdue_count ? `${data.fees.overdue_count} overdue` : "No overdue invoices"} />
          : <StatCard label="Class" value={null} icon="layers" tone="brand" hint={s.class_label || "—"} />}
        <StatCard label="Exam entries" value={data.academics.recent_marks.length} icon="exams" tone="teal" />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHead title="Student" icon="user" />
              <dl className="px-5 pb-4">
                <Row label="Student ID" value={<span className="font-mono text-[12px]">{s.id}</span>} />
                <Row label="Admission no" value={s.admission_no} />
                <Row label="Class" value={s.class?.name} />
                <Row label="Section" value={s.section} />
                <Row label="Roll no" value={s.roll_no} />
                <Row label="House" value={s.house} />
                <Row label="Status" value={<Badge tone={s.status === "Active" ? "emerald" : "slate"}>{s.status}</Badge>} />
                <Row label="Date of birth" value={s.dob} />
                <Row label="Gender" value={s.gender} />
                <Row label="Blood group" value={s.blood_group} />
                <Row label="Enrolled" value={s.enrollment_date} />
              </dl>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHead title="Parents & contact" icon="phone"
                  subtitle={data.visibility.contacts ? undefined : "Contact details are visible to office and leadership roles."} />
                <dl className="px-5 pb-4">
                  <Row label="Father" value={data.parents.father_name} />
                  <Row label="Mother" value={data.parents.mother_name} />
                  {data.visibility.contacts && <Row label="Mobile" value={<PhoneLink value={data.parents.mobile_number} />} />}
                  {data.visibility.contacts && <Row label="Email" value={<MailLink value={data.parents.email} />} />}
                  {data.parents.linked_accounts.map((l, i) => (
                    <Row key={i} label={`Portal login (${l.relation})`} value={<>{l.name ?? "—"}{l.email ? <span className="block text-[12px] font-normal text-ink-3">{l.email}</span> : null}</>} />
                  ))}
                </dl>
              </Card>
              <Card>
                <CardHead title="Hostel" icon="hostel" />
                <dl className="px-5 pb-4">
                  {data.hostel ? (
                    <>
                      <Row label="Hostel" value={data.hostel.hostel} />
                      <Row label="Room" value={data.hostel.room} />
                      <Row label="Bed" value={data.hostel.bed} />
                    </>
                  ) : <p className="py-2 text-[13px] text-ink-3">Day scholar — no hostel room allocated.</p>}
                </dl>
              </Card>
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <Card>
            <CardHead title="Attendance" icon="attendance" subtitle="Percentage is computed over every recorded day." />
            <div className="space-y-4 px-5 pb-5">
              <ProgressBar value={data.attendance.percentage ?? 0} tone="emerald" label="Attendance percentage" />
              <div className="flex flex-wrap gap-2 text-[13px]">
                <Badge tone="emerald">Present {data.attendance.present}</Badge>
                <Badge tone="rose">Absent {data.attendance.absent}</Badge>
                <Badge tone="amber">Late {data.attendance.late}</Badge>
              </div>
              {data.attendance.recent.length === 0
                ? <EmptyState icon="calendar" title="No attendance recorded yet" />
                : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.attendance.recent.map((r) => (
                      <span key={r.date} title={`${r.date}: ${r.status}`}>
                        <Badge tone={statusTone(r.status)} className="tnum">{r.date.slice(5)}</Badge>
                      </span>
                    ))}
                  </div>
                )}
            </div>
          </Card>
        )}

        {tab === "fees" && data.fees && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Invoiced" value={data.fees.invoiced} prefix="₹" icon="receipt" tone="brand" />
              <StatCard label="Paid" value={data.fees.paid} prefix="₹" icon="check" tone="emerald" />
              <StatCard label="Balance" value={data.fees.balance} prefix="₹" icon="wallet" tone="amber" />
              <StatCard label="Overdue" value={data.fees.overdue_amount} prefix="₹" icon="alert" tone="rose" hint={`${data.fees.overdue_count} invoice(s)`} />
            </div>
            <Card>
              <CardHead title="Invoices" icon="receipt" />
              <TableView id="profile-invoices">
                <table className="w-full">
                  <thead><tr className="table-head"><th>Invoice</th><th>Term</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {data.fees.invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="font-mono text-[12px]">{i.invoice_no ?? "—"}</td>
                        <td>{i.term}</td>
                        <td className="tnum">{i.due_date}</td>
                        <td className="tnum text-right">{rupees(i.total)}</td>
                        <td className="tnum text-right">{rupees(i.balance)}</td>
                        <td>{i.overdue ? <Badge tone="rose">Overdue</Badge> : <Badge tone={i.status === "Paid" ? "emerald" : "amber"}>{i.status}</Badge>}</td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" loading={busy === `inv-${i.id}`}
                            onClick={() => download(`inv-${i.id}`, `/api/fees/invoices/${i.id}/invoice.pdf`, `invoice-${i.invoice_no ?? i.id}.pdf`)}>
                            <Icon name="download" className="h-3.5 w-3.5" /> PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {data.fees.invoices.length === 0 && <tr><td colSpan={7}><EmptyState icon="receipt" title="No invoices yet" /></td></tr>}
                  </tbody>
                </table>
              </TableView>
            </Card>
            <Card>
              <CardHead title="Payments & receipts" icon="wallet" />
              <TableView id="profile-payments">
                <table className="w-full">
                  <thead><tr className="table-head"><th>Receipt</th><th>Date</th><th>Invoice</th><th>Mode</th><th className="text-right">Amount</th><th /></tr></thead>
                  <tbody>
                    {data.fees.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-[12px]">{p.receipt_no ?? "—"}</td>
                        <td className="tnum">{p.date}</td>
                        <td className="font-mono text-[12px]">{p.invoice_no ?? "—"}</td>
                        <td>{p.online ? <Badge tone="sky">Online</Badge> : p.mode}</td>
                        <td className="tnum text-right">{rupees(p.amount)}</td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" loading={busy === `rc-${p.id}`}
                            onClick={() => download(`rc-${p.id}`, `/api/fees/payments/${p.id}/receipt.pdf`, `receipt-${p.receipt_no ?? p.id}.pdf`)}>
                            <Icon name="download" className="h-3.5 w-3.5" /> Receipt
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {data.fees.payments.length === 0 && <tr><td colSpan={6}><EmptyState icon="wallet" title="No payments recorded" /></td></tr>}
                  </tbody>
                </table>
              </TableView>
            </Card>
          </div>
        )}

        {tab === "academics" && (
          <Card>
            <CardHead title="Recent marks" icon="exams" />
            {data.academics.recent_marks.length === 0 ? <EmptyState icon="exams" title="No marks entered yet" /> : (
              <TableView id="profile-marks">
                <table className="w-full">
                  <thead><tr className="table-head"><th>Exam</th><th>Date</th><th>Subject</th><th className="text-right">Score</th><th className="text-right">%</th></tr></thead>
                  <tbody>
                    {data.academics.recent_marks.map((m, i) => (
                      <tr key={`${m.exam_id}-${m.subject}-${i}`}>
                        <td>{m.exam}{m.term ? <span className="ml-1 text-[11.5px] text-ink-3">{m.term}</span> : null}</td>
                        <td className="tnum">{m.date}</td>
                        <td>{m.subject}</td>
                        <td className="tnum text-right">{m.score} / {m.max_score}</td>
                        <td className="tnum text-right">{m.percentage ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableView>
            )}
          </Card>
        )}

        {tab === "documents" && data.documents && (
          <Card>
            <CardHead title="Documents" icon="file" subtitle="Archived from the admission application into the student's document store." />
            {data.documents.length === 0 ? <EmptyState icon="file" title="No archived documents" /> : (
              <ul className="divide-y divide-line px-5 pb-3">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold capitalize text-ink">{d.doc_type.replace(/_/g, " ")}</p>
                      <p className="text-[12px] text-ink-3">{d.file_name} · {(d.size_bytes / 1024).toFixed(1)} KB · {d.created_at.slice(0, 10)}</p>
                    </div>
                    <Button size="sm" loading={busy === `doc-${d.id}`} onClick={() => openDocument(d.id, d.file_name)}>
                      <Icon name="download" className="h-3.5 w-3.5" /> Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
