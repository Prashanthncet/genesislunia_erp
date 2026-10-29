"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import {
  Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, MailLink, Modal, PageHeader, PhoneLink, ProgressBar, Skeleton, StatCard, Tabs, useToast,
} from "@/components/ui";
import { TableView } from "@/components/TableView";
import { DocLink, docHref } from "@/components/admissions/shared";
import { StudentCalendar } from "@/components/attendance/StudentCalendar";
import { ATTENDANCE_READ, ATTENDANCE_RULE_TEXT, AttendanceLegend, CountTile, StatusTag } from "@/components/attendance/status";

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
    od?: number; leave?: number; attended?: number; rule?: string;
    recent: { date: string; status: string; note?: string | null }[];
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

const ID_TEMPLATES = [
  { id: "classic", name: "Classic Institutional (Navy)", badge: "Default", headerBg: "bg-brand-900 text-white", desc: "Standard portrait layout with full student & guardian particulars" },
  { id: "modern", name: "Modern Split Grid", badge: "2-Col", headerBg: "bg-sky-900 text-white", desc: "Two-column tabular badge layout with prominent house & roll number" },
  { id: "compact", name: "Compact Lanyard Card", badge: "Compact", headerBg: "bg-emerald-900 text-white", desc: "Streamlined essential fields for quick gate & library scanning" },
  { id: "crest", name: "Royal Crest & Motto", badge: "Ceremonial", headerBg: "bg-amber-900 text-white", desc: "Formal ceremonial layout with custom school motto banner" },
] as const;

const ID_FIELD_OPTIONS = [
  { key: "roll_no", label: "Roll No" },
  { key: "house", label: "House" },
  { key: "blood_group", label: "Blood Group" },
  { key: "dob", label: "Date of Birth" },
  { key: "emergency_contact", label: "Emergency Contact" },
  { key: "valid_until", label: "Valid Until" },
] as const;

/** 2-up KPI tiles at 360px are ~156px wide: a 30px "₹1,25,000" would overflow. */
const KPI_M = "max-md:min-w-0 max-md:p-3.5 max-md:[&_.font-display]:text-[22px] max-md:[&_.font-display]:[overflow-wrap:anywhere]";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0 max-md:grid max-md:grid-cols-[7.5rem_minmax(0,1fr)] max-md:items-baseline max-md:gap-3">
      <dt className="text-[12.5px] text-ink-3 max-md:shrink-0">{label}</dt>
      <dd className="text-right text-[13.5px] font-semibold text-ink max-md:min-w-0 max-md:text-left max-md:[overflow-wrap:anywhere]">{value ?? "—"}</dd>
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
  const [showIdCustomizer, setShowIdCustomizer] = useState(false);
  const [idTemplate, setIdTemplate] = useState<string>("classic");
  const [idTagline, setIdTagline] = useState<string>("DISCIPLINE · HONOUR · EXCELLENCE");
  const [idFields, setIdFields] = useState<string[]>(["roll_no", "house", "blood_group", "dob", "emergency_contact", "valid_until"]);

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

  const toggleIdField = (key: string) => {
    setIdFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
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
  const activeTpl = ID_TEMPLATES.find((t) => t.id === idTemplate) ?? ID_TEMPLATES[0];
  const buildIdCardUrl = () => {
    const q = new URLSearchParams();
    q.set("template", idTemplate);
    if (idTagline.trim()) q.set("tagline", idTagline.trim());
    q.set("fields", idFields.join(","));
    return `/api/students/${s.id}/export/id-card.pdf?${q.toString()}`;
  };

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "attendance" as const, label: "Attendance", count: data.attendance.records_counted },
    ...(data.fees ? [{ id: "fees" as const, label: "Fees", count: data.fees.invoices.length }] : []),
    { id: "academics" as const, label: "Academics", count: data.academics.recent_marks.length },
    ...(data.documents ? [{ id: "documents" as const, label: "Documents", count: data.documents.length }] : []),
  ];

  return (
    <div className="space-y-6 max-md:space-y-4">
      <PageHeader
        icon="students"
        eyebrow={isPortal(me) ? "Student profile" : "Student Master · read-only"}
        title={s.full_name}
        subtitle={`${s.class_label || "No class"} · Admission ${s.admission_no}${s.roll_no ? ` · Roll ${s.roll_no}` : ""}`}
        actions={
          <>
            {!isPortal(me) && <Link href="/students" className="btn-ghost"><Icon name="chevronLeft" className="h-4 w-4" /> Students</Link>}
            {canExport && s.status === "Active" && (
              <>
                <Button variant="soft" onClick={() => setShowIdCustomizer(true)}>
                  <Icon name="spark" className="h-4 w-4" /> Customize ID Card
                </Button>
                <Button loading={busy === "id"} onClick={() => download("id", buildIdCardUrl(), `ID-${s.admission_no}.pdf`)}>
                  <Icon name="user" className="h-4 w-4" /> ID card
                </Button>
              </>
            )}
            {canExport && s.status !== "Active" && (
              <Button variant="primary" loading={busy === "tc"} onClick={() => download("tc", `/api/students/${s.id}/export/tc.pdf`, `TC-${s.admission_no}.pdf`)}>
                <Icon name="file" className="h-4 w-4" /> Transfer certificate
              </Button>
            )}
          </>
        }
      />

      {/* Customizable ID Card Template Modal */}
      <Modal
        open={showIdCustomizer}
        onClose={() => setShowIdCustomizer(false)}
        title="Customize Student ID Card Template"
        subtitle="Select from 4 static institutional templates and customize displayed fields & motto."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowIdCustomizer(false)}>Close</Button>
            <Button
              variant="primary"
              loading={busy === "id"}
              onClick={() => download("id", buildIdCardUrl(), `ID-${s.admission_no}-${idTemplate}.pdf`)}
            >
              <Icon name="download" className="h-4 w-4" /> Download ID Card ({activeTpl.name.split(" ")[0]})
            </Button>
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">1. Choose Static Template</p>
              <div className="space-y-2">
                {ID_TEMPLATES.map((tpl) => {
                  const active = idTemplate === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setIdTemplate(tpl.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-all ${
                        active ? "border-brand-700 bg-brand-50/70 ring-2 ring-brand-700/15" : "border-line bg-surface hover:bg-surface-2"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">{tpl.name}</span>
                        <Badge tone={active ? "sky" : "slate"}>{tpl.badge}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-3">{tpl.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="2. Custom Header Motto / Tagline">
              <Input
                value={idTagline}
                onChange={(e) => setIdTagline(e.target.value)}
                placeholder="e.g. DISCIPLINE · HONOUR · EXCELLENCE"
              />
            </Field>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">3. Toggle Card Fields</p>
              <div className="flex flex-wrap gap-2">
                {ID_FIELD_OPTIONS.map((f) => {
                  const on = idFields.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => toggleIdField(f.key)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        on ? "border-brand-700 bg-brand-50 text-brand-700" : "border-line bg-surface-2 text-ink-3"
                      }`}
                    >
                      {on ? "✓ " : ""}{f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live Visual Preview */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface-2/60 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Live Template Preview</p>
            <div className="w-full max-w-[280px] overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
              <div className={`px-4 py-3 text-center ${activeTpl.headerBg}`}>
                <p className="text-xs font-bold uppercase tracking-wider">Sainik School / Genesis ERP</p>
                {idTagline.trim() && <p className="mt-0.5 text-[10px] opacity-85">{idTagline.trim()}</p>}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-12 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-xs font-bold text-brand-700">
                    PHOTO
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{s.full_name}</p>
                    <p className="font-mono text-xs text-ink-3">{s.admission_no}</p>
                    <p className="mt-0.5 text-xs font-semibold text-brand-700">{s.class_label || "No class"}</p>
                  </div>
                </div>
                <dl className="mt-3 space-y-1 border-t border-line pt-2.5 text-xs">
                  {idFields.includes("roll_no") && (
                    <div className="flex justify-between"><dt className="text-ink-3">Roll No</dt><dd className="font-semibold text-ink">{s.roll_no ?? "—"}</dd></div>
                  )}
                  {idFields.includes("house") && idTemplate !== "compact" && (
                    <div className="flex justify-between"><dt className="text-ink-3">House</dt><dd className="font-semibold text-ink">{s.house ?? "—"}</dd></div>
                  )}
                  {idFields.includes("blood_group") && (
                    <div className="flex justify-between"><dt className="text-ink-3">Blood Group</dt><dd className="font-semibold text-ink">{s.blood_group ?? "—"}</dd></div>
                  )}
                  {idFields.includes("dob") && idTemplate !== "compact" && (
                    <div className="flex justify-between"><dt className="text-ink-3">DOB</dt><dd className="font-semibold text-ink">{s.dob ?? "—"}</dd></div>
                  )}
                  {idFields.includes("emergency_contact") && (
                    <div className="flex justify-between"><dt className="text-ink-3">Emergency</dt><dd className="font-mono font-semibold text-ink">{data.parents.mobile_number ?? "—"}</dd></div>
                  )}
                  {idFields.includes("valid_until") && (
                    <div className="flex justify-between"><dt className="text-ink-3">Valid Until</dt><dd className="font-mono text-ink-2">2027-03-31</dd></div>
                  )}
                </dl>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[10px] text-ink-3">
                  <span className="font-mono">QR · GENESIS:{s.id.slice(0, 6)}</span>
                  <span className="font-semibold text-ink-2">Principal Sign</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 max-md:gap-3">
        <StatCard className={KPI_M} label="Attendance" value={data.attendance.percentage} suffix="%" decimals={1} icon="attendance" tone="emerald"
          hint={`${data.attendance.attended ?? data.attendance.present} of ${data.attendance.records_counted} counted days`} />
        <StatCard className={KPI_M} label="House" value={null} icon="flag" tone="sky" hint={s.house ?? "Not assigned"} />
        {data.fees
          ? <StatCard className={KPI_M} label="Fee balance" value={data.fees.balance} prefix="₹" icon="wallet" tone={data.fees.overdue_count ? "rose" : "brand"}
            hint={data.fees.overdue_count ? `${data.fees.overdue_count} overdue` : "No overdue invoices"} />
          : <StatCard className={KPI_M} label="Class" value={null} icon="layers" tone="brand" hint={s.class_label || "—"} />}
        <StatCard className={KPI_M} label="Exam entries" value={data.academics.recent_marks.length} icon="exams" tone="teal" />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-2 max-md:gap-3">
            <Card>
              <CardHead title="Student" icon="user" />
              <dl className="px-5 pb-4 max-md:px-4">
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
            <div className="space-y-4 max-md:space-y-3">
              <Card>
                <CardHead title="Parents & contact" icon="phone"
                  subtitle={data.visibility.contacts ? undefined : "Contact details are visible to office and leadership roles."} />
                <dl className="px-5 pb-4 max-md:px-4">
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
                <dl className="px-5 pb-4 max-md:px-4">
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
            <CardHead title="Attendance" icon="attendance" subtitle={ATTENDANCE_RULE_TEXT} />
            <div className="space-y-4 px-3 pb-5 sm:px-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
                  <span className="text-[12px] text-ink-2">Overall</span>
                  <span className="tnum ml-auto text-[15px] font-bold text-brand-700 max-md:text-[16px]">{data.attendance.percentage == null ? "—" : `${data.attendance.percentage}%`}</span>
                </div>
                <CountTile status="Present" value={data.attendance.present} />
                <CountTile status="Absent" value={data.attendance.absent} />
                <CountTile status="Late" value={data.attendance.late} />
                <CountTile status="OD" value={data.attendance.od ?? 0} />
                <CountTile status="Leave" value={data.attendance.leave ?? 0} />
              </div>
              <ProgressBar value={data.attendance.percentage ?? 0} tone="emerald" label="Attendance percentage" />
              {hasRole(me, ATTENDANCE_READ) ? (
                <div className="rounded-xl border border-line p-3 sm:p-4">
                  <StudentCalendar studentId={s.id} showName={false} />
                </div>
              ) : data.attendance.recent.length === 0 ? (
                <EmptyState icon="calendar" title="No attendance recorded yet" />
              ) : (
                <>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Recent days</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {data.attendance.recent.map((r) => (
                      <li key={r.date} className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-1 text-[11.5px] max-md:px-2 max-md:text-[12px]">
                        <span className="tnum text-ink-3">{r.date.slice(5)}</span>
                        <StatusTag status={r.status} title={r.note ? `${r.status}: ${r.note}` : undefined} />
                      </li>
                    ))}
                  </ul>
                  <AttendanceLegend showRule={false} />
                </>
              )}
            </div>
          </Card>
        )}

        {tab === "fees" && data.fees && (
          <div className="space-y-4 max-md:space-y-3">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 max-md:gap-3">
              <StatCard className={KPI_M} label="Invoiced" value={data.fees.invoiced} prefix="₹" icon="receipt" tone="brand" />
              <StatCard className={KPI_M} label="Paid" value={data.fees.paid} prefix="₹" icon="check" tone="emerald" />
              <StatCard className={KPI_M} label="Balance" value={data.fees.balance} prefix="₹" icon="wallet" tone="amber" />
              <StatCard className={KPI_M} label="Overdue" value={data.fees.overdue_amount} prefix="₹" icon="alert" tone="rose" hint={`${data.fees.overdue_count} invoice(s)`} />
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
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" loading={busy === `inv-${i.id}`}
                              onClick={() => download(`inv-${i.id}`, `/api/fees/invoices/${i.id}/invoice.pdf`, `invoice-${i.invoice_no ?? i.id}.pdf`)}>
                              <Icon name="download" className="h-3.5 w-3.5" /> PDF
                            </Button>
                            {isPortal(me) && i.balance > 0 && (
                              <Link href="/portal/fees" className="btn btn-primary btn-sm">
                                <Icon name="wallet" className="h-3.5 w-3.5" /> Pay Fees
                              </Link>
                            )}
                          </div>
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
              <ul className="divide-y divide-line px-5 pb-3 max-md:px-4">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3 max-md:flex-nowrap">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold capitalize text-ink">{d.doc_type.replace(/_/g, " ")}</p>
                      <p className="text-[12px] text-ink-3 max-md:break-all">{d.file_name} · {(d.size_bytes / 1024).toFixed(1)} KB · {d.created_at.slice(0, 10)}</p>
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
