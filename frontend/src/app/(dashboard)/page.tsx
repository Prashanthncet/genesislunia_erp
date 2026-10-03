"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AnimatedNumber, Badge, Card, EmptyState, Icon, PageHeader, ProgressBar, Reveal, Skeleton } from "@/components/ui";

type Dashboard = {
  students_active: number; staff_active: number; classes: number; incidents_open: number;
  staff_leaves_pending: number; gate_passes_pending: number; admissions_in_progress: number;
  fees: { invoiced: number; collected: number; collection_pct: number | null };
};
type AttendanceRow = { class_id: string; class_name: string; section: string | null; attendance_pct: number | null; total_records: number };
type FeesReport = { invoiced: number; collected: number; outstanding: number; collection_pct: number | null; invoice_count: number };
type NotificationLog = { id: string; channel: string; recipient: string; subject: string | null; body: string; refType: string | null; status: string; createdAt: string };

const MODULES = [
  { href: "/students", name: "Students", icon: "students", desc: "Master records, profiles, attendance %" },
  { href: "/admissions", name: "Admissions", icon: "admissions", desc: "9-step workflow to enrolment" },
  { href: "/fees", name: "Fees", icon: "fees", desc: "Structures, invoices, receipts" },
  { href: "/attendance", name: "Attendance", icon: "attendance", desc: "Daily marking + monthly register" },
  { href: "/timetable", name: "Timetable", icon: "timetable", desc: "Periods & auto substitutions" },
  { href: "/academics", name: "Academics", icon: "academics", desc: "Subjects, syllabus, assignments" },
  { href: "/exams", name: "Exams", icon: "exams", desc: "Marks ledger & report cards" },
  { href: "/cbt", name: "CBT Tests", icon: "cbt", desc: "Question bank & timed exams" },
  { href: "/leaves", name: "Leaves & Passes", icon: "leaves", desc: "Leave approvals, gate passes" },
  { href: "/hostel", name: "Hostel", icon: "hostel", desc: "Rooms, allocation, visitors" },
  { href: "/staff", name: "Staff & Payroll", icon: "staff", desc: "Staff, salaries, payslips" },
  { href: "/discipline", name: "Discipline", icon: "discipline", desc: "Incidents & audit trail" },
  { href: "/reports", name: "Reports", icon: "reports", desc: "Dashboards & CSV exports" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHome() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [fees, setFees] = useState<FeesReport | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [notes, setNotes] = useState<NotificationLog[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<Dashboard>("/api/reports/dashboard"),
      apiFetch<FeesReport>("/api/reports/fees"),
      apiFetch<AttendanceRow[]>("/api/reports/attendance"),
      apiFetch<NotificationLog[]>("/api/notifications"),
    ])
      .then(([d, f, a, n]) => { setDash(d); setFees(f); setAttendance(a ?? []); setNotes((n ?? []).slice(0, 5)); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load dashboard"));
  }, []);

  const role = (typeof window !== "undefined" ? localStorage.getItem("role") ?? "" : "").toUpperCase();
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-7 pb-4">
      <Reveal>
        <PageHeader
          icon="home"
          title={`${greeting()}${role ? `, ${role.replace(/_/g, " ")}` : ""}`}
          subtitle="Here is what needs your attention across the school today."
          actions={
            <>
              <Link href="/reports" className="btn-soft">
                <Icon name="reports" className="h-4 w-4" /> Reports
              </Link>
              <Link href="/admissions" className="btn-primary">
                <Icon name="plus" className="h-4 w-4" /> New Admission
              </Link>
            </>
          }
        />
      </Reveal>

      {error && (
        <div className="card flex items-center gap-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <Icon name="alert" className="h-4 w-4" /> {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!dash ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Reveal delay={0}><Kpi label="Active Students" value={dash.students_active} icon="students" tone="brand" hint={`${dash.classes} classes`} /></Reveal>
            <Reveal delay={60}><Kpi label="Active Staff" value={dash.staff_active} icon="staff" tone="violet" hint="teaching + non-teaching" /></Reveal>
            <Reveal delay={120}><Kpi label="Admissions In Progress" value={dash.admissions_in_progress} icon="admissions" tone="sky" hint="not yet confirmed" /></Reveal>
            <Reveal delay={180}>
              <Kpi
                label="Fee Collected"
                value={dash.fees.collection_pct}
                suffix="%"
                decimals={1}
                icon="fees"
                tone={dash.fees.collection_pct !== null && dash.fees.collection_pct < 70 ? "rose" : "emerald"}
                hint={`${inr(dash.fees.collected)} of ${inr(dash.fees.invoiced)}`}
              />
            </Reveal>
          </>
        )}
      </div>

      {/* Attention + money */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" hover>
          <div className="flex items-center justify-between p-5 pb-3">
            <div>
              <h2 className="font-bold text-slate-800">Attendance this term</h2>
              <p className="text-xs text-slate-400">Present share per class</p>
            </div>
            <Link href="/reports" className="text-xs font-semibold text-brand-600 transition-colors duration-200 hover:text-brand-800 hover:underline">View report →</Link>
          </div>
          <div className="space-y-3 px-5 pb-5">
            {attendance.length === 0 && <EmptyState title="No attendance recorded yet" hint="Mark a class to see percentages here." icon="attendance" />}
            {attendance.map((a, i) => (
              <div key={a.class_id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm font-semibold text-slate-700">
                  {a.class_name} {a.section ?? ""}
                </span>
                <ProgressBar value={a.attendance_pct ?? 0} tone={(a.attendance_pct ?? 100) >= 75 ? "emerald" : (a.attendance_pct ?? 100) >= 60 ? "amber" : "rose"} className="flex-1" />
                <span className="w-12 text-right text-xs font-bold text-slate-500 tnum">
                  {a.attendance_pct === null ? "—" : `${a.attendance_pct}%`}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card hover delay={80}>
            <div className="p-5">
              <h2 className="font-bold text-slate-800">Needs attention</h2>
              <ul className="mt-3 space-y-2.5">
                {dash && [
                  { label: "Pending staff leaves", value: dash.staff_leaves_pending, href: "/leaves", tone: "amber" as const },
                  { label: "Gate passes awaiting approval", value: dash.gate_passes_pending, href: "/leaves", tone: "amber" as const },
                  { label: "Open incidents", value: dash.incidents_open, href: "/discipline", tone: "rose" as const },
                  { label: "Fee outstanding", value: fees ? Math.round(fees.outstanding) : 0, money: true, href: "/fees", tone: "rose" as const },
                ].map((row) => (
                  <li key={row.label}>
                    <Link href={row.href} className="group flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="flex items-center gap-1 text-sm font-bold text-slate-800 group-hover:text-brand-700">
                        {"money" in row && row.money ? <AnimatedNumber value={row.value} prefix="₹" /> : <AnimatedNumber value={row.value} />}
                        <span className="transition-transform group-hover:translate-x-0.5">→</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card hover delay={140}>
            <div className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">Fee collection</h2>
                <Badge tone={fees && fees.collection_pct !== null && fees.collection_pct < 70 ? "rose" : "emerald"}>
                  {fees?.collection_pct === null || fees === null ? "—" : `${fees.collection_pct}%`}
                </Badge>
              </div>
              <ProgressBar value={fees?.collection_pct ?? 0} tone={fees && fees.collection_pct !== null && fees.collection_pct < 70 ? "rose" : "emerald"} />
              <div className="mt-3 flex justify-between text-xs text-slate-500">
                <span>Collected <b className="text-emerald-700">{fees ? inr(fees.collected) : "—"}</b></span>
                <span>Invoiced <b>{fees ? inr(fees.invoiced) : "—"}</b></span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Module grid */}
      <section>
        <Reveal>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">All modules</h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MODULES.map((m, i) => (
            <Reveal key={m.href} delay={i * 40}>
              <Link href={m.href} className="card card-hover group flex h-full flex-col p-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-white text-brand-600 ring-1 ring-brand-100 transition-transform duration-300 group-hover:scale-110 group-hover:ring-brand-200">
                  <Icon name={m.icon} />
                </span>
                <span className="mt-3 text-sm font-bold text-slate-800 transition-colors group-hover:text-brand-700">{m.name}</span>
                <span className="mt-0.5 text-xs text-slate-400">{m.desc}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Recent notifications */}
      <Card hover>
        <div className="flex items-center justify-between p-5 pb-2">
          <h2 className="font-bold text-slate-800">Recent parent communication</h2>
          <Link href="/notifications" className="text-xs font-semibold text-brand-600 transition-colors duration-200 hover:text-brand-800 hover:underline">Open log →</Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {notes.length === 0 && <li><EmptyState title="Nothing sent yet" hint="SMS/email events from every module appear here." icon="bell" /></li>}
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-5 py-3 row-hover">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name={n.channel === "email" ? "admissions" : "bell"} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">{n.subject ?? n.body.slice(0, 60)}</p>
                <p className="truncate text-xs text-slate-400">{n.recipient} · {n.channel}{n.refType ? ` · ${n.refType}` : ""}</p>
              </div>
              <Badge tone={n.status === "sent" ? "emerald" : n.status === "failed" ? "rose" : "slate"}>{n.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Kpi({
  label, value, icon, tone, hint, suffix = "", decimals = 0,
}: {
  label: string; value: number | null; icon: string; tone: "brand" | "emerald" | "rose" | "sky" | "violet";
  hint?: string; suffix?: string; decimals?: number;
}) {
  const chips = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="card card-hover group p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${chips[tone]}`}>
          <Icon name={icon} className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value === null ? <span className="text-slate-300">—</span> : <AnimatedNumber value={value} suffix={suffix} decimals={decimals} />}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
    </div>
  );
}