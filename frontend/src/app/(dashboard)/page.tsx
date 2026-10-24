"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Icon, Skeleton } from "@/components/ui";
import { TiltCard } from "@/components/motion/AnimatedCards";
import { DonutRing } from "@/components/charts/DonutRing";
import { RingGrid, type RingDatum } from "@/components/charts/RingGrid";
import { GroupedBars, type BarSeries } from "@/components/charts/GroupedBars";
import { KpiCard, type KpiDelta } from "@/components/charts/KpiCard";
import { SparkArea } from "@/components/charts/SparkArea";
import type { Notice } from "@/components/NotificationStackPopover";
import { formatLongDate, greeting, inr, inrCompact, relativeTime } from "@/lib/format";
import { CHART_SERIES } from "@/lib/chart";
import { R, ROLE, ROLE_LABEL, hasRole, useMe, type Me } from "@/lib/auth";
import { canAccess } from "@/lib/nav";
import {
  AdmissionQueueWidget, ApprovalsWidget, ClassesToMarkWidget, FeesWidget, GateDeskWidget,
  LeaveApprovalsWidget, LessonPlansWidget, SafeguardingWidget, StudentLeaveWidget, TodayScheduleWidget, WardenHostelWidget,
} from "./_home/RoleWidgets";

/* ── API shapes ───────────────────────────────────────────────── */

type Dashboard = {
  students_active: number;
  staff_active: number;
  classes: number;
  incidents_open: number;
  staff_leaves_pending: number;
  gate_passes_pending: number;
  admissions_in_progress: number;
  fees: { invoiced: number; collected: number; collection_pct: number | null } | null;
};

type FeesReport = {
  invoiced: number;
  collected: number;
  outstanding: number;
  collection_pct: number | null;
  invoice_count: number;
  by_status?: Record<string, number>;
};

type AttendanceRow = {
  class_id: string;
  class_name: string;
  section: string | null;
  attendance_pct: number | null;
  present: number;
  total_records: number;
};

type ExamClassRow = {
  class_id: string;
  class_name: string;
  section: string | null;
  avg_score_pct: number | null;
  marks_count: number;
};

type ExamScores = {
  exam_id: string;
  exam_name: string;
  exam_date: string;
  classes: ExamClassRow[];
};

type TrendPoint = {
  month: string;
  label: string;
  year: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  enrollments: number;
  classes: number;
  attendance_pct: number | null;
  attendance_records: number;
};

type Summary = {
  hostel: { capacity: number; allocated: number; occupancy_pct: number | null };
  payroll_total_net: number;
  payslip_count: number;
};

/** The handful of tasks this branch does every day — one tap from the dashboard. */
const QUICK_ACTIONS = [
  { href: "/attendance", icon: "attendance", label: "Roll call", tone: "bg-ok-soft text-ok-ink" },
  { href: "/students", icon: "students", label: "Add student", tone: "bg-brand-50 text-brand-700" },
  { href: "/fees", icon: "receipt", label: "Collect fee", tone: "bg-warn-soft text-warn-ink" },
  { href: "/admissions", icon: "admissions", label: "Admissions", tone: "bg-info-soft text-info-ink" },
  { href: "/classes", icon: "layers", label: "Classes", tone: "bg-accent-50 text-accent-600" },
  { href: "/timetable", icon: "timetable", label: "Timetable", tone: "bg-teal-50 text-teal-700" },
  { href: "/notifications", icon: "bell", label: "Announce", tone: "bg-danger-soft text-danger" },
  { href: "/reports", icon: "reports", label: "Reports", tone: "bg-surface-2 text-ink-2" },
];

const NOTICE_META: Record<string, { icon: string; label: string }> = {
  admission: { icon: "admissions", label: "Admission" },
  attendance: { icon: "attendance", label: "Attendance" },
  gate_pass: { icon: "door", label: "Gate pass" },
  payroll: { icon: "wallet", label: "Payroll" },
  cbt: { icon: "cbt", label: "CBT" },
  fees: { icon: "fees", label: "Fees" },
  discipline: { icon: "shield", label: "Discipline" },
  leave: { icon: "leaves", label: "Leave" },
};

/** Change between the last two points of a real series — null when unknowable. */
function momDelta(series: number[], label: string): KpiDelta | null {
  const vals = series.filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;
  const latest = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  // A percentage change from zero is not a number; say so rather than invent one.
  if (!prev) return null;
  return { ratio: (latest - prev) / prev, label };
}

/**
 * School-wide analytics board. Rendered only for leadership (every endpoint it
 * calls is in R.REPORTS / R.NOTIFICATION_LOG, which include R.LEADERSHIP).
 */
function LeadershipBoard({ me }: { me: Me }) {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [fees, setFees] = useState<FeesReport | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [examScores, setExamScores] = useState<ExamScores[] | null>(null);
  const [trends, setTrends] = useState<TrendPoint[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const role = me.name?.split(" ").filter((p) => !/^(mr|mrs|ms|dr|col|brig)\.?$/i.test(p))[0] ?? ROLE_LABEL[me.role] ?? "there";
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => new Date());

  const load = useCallback(async () => {
    setError(null);

    try {
      const [d, f] = await Promise.all([
        apiFetch<Dashboard>("/api/reports/dashboard"),
        apiFetch<FeesReport>("/api/reports/fees"),
      ]);
      setDash(d);
      setFees(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the reports API");
    }

    // Secondary panels degrade independently — one failure must not blank the page.
    apiFetch<AttendanceRow[]>("/api/reports/attendance").then(setAttendance).catch(() => setAttendance([]));
    apiFetch<ExamScores[]>("/api/reports/exam-scores").then(setExamScores).catch(() => setExamScores([]));
    apiFetch<{ points: TrendPoint[] }>("/api/reports/trends")
      .then((r) => setTrends(Array.isArray(r?.points) ? r.points : []))
      .catch(() => setTrends([]));
    apiFetch<Summary>("/api/reports/summary").then(setSummary).catch(() => setSummary(null));
    apiFetch<Notice[]>("/api/notifications")
      .then((rows) => setNotices(Array.isArray(rows) ? rows : []))
      .catch(() => setNotices([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Derived, never invented ────────────────────────────────── */

  const points = trends ?? [];
  const monthsLoading = trends === null;

  // Only months that actually carry billing — leading empty months would be a
  // run of flat bars that just adds noise.
  const feePoints = points.filter((p) => p.invoiced > 0 || p.collected > 0 || p.outstanding > 0);

  const collectedSeries = points.filter((p) => typeof p.collected === "number").map((p) => p.collected);
  const enrollmentSeries = points.map((p) => p.enrollments);
  const classSeries = points.map((p) => p.classes);
  const attendanceSeries = points.map((p) => p.attendance_pct).filter((v): v is number => v !== null);

  const attendanceTotal = (attendance ?? []).reduce((sum, r) => sum + r.total_records, 0);
  const attendancePresent = (attendance ?? []).reduce((sum, r) => sum + r.present, 0);
  const attendanceWeighted = attendanceTotal > 0 ? (attendancePresent / attendanceTotal) * 100 : null;

  // "Class 10 A", not "Class 10 · A": the middot created an orphaned section
  // letter on its own line in a narrow column.
  const classLabel = (c: { class_name: string; section: string | null }) =>
    c.section ? `${c.class_name} ${c.section}` : c.class_name;

  const rings: RingDatum[] = (attendance ?? []).map((r) => ({
    id: r.class_id,
    label: classLabel(r),
    value: r.attendance_pct,
    caption: r.total_records > 0 ? `${r.present} / ${r.total_records}` : "no roll call yet",
  }));

  const feeSeries: BarSeries[] = [
    { label: "Collected", color: CHART_SERIES[0], values: feePoints.map((p) => p.collected) },
    { label: "Outstanding", color: CHART_SERIES[4], values: feePoints.map((p) => p.outstanding) },
  ];

  // Compare the two exams that actually carry marks; the rest would be empty bars.
  const rankedExams = (examScores ?? [])
    .map((e) => ({ ...e, marks: e.classes.reduce((s, c) => s + c.marks_count, 0) }))
    .filter((e) => e.marks > 0)
    .sort((a, b) => b.marks - a.marks)
    .slice(0, 2);
  const examCategories = (examScores?.[0]?.classes ?? []).map(classLabel);
  const examSeries: BarSeries[] = rankedExams.map((e, i) => ({
    label: e.exam_name,
    color: CHART_SERIES[i],
    values: e.classes.map((c) => c.avg_score_pct),
  }));

  const collected = fees?.collected ?? 0;
  const outstanding = fees?.outstanding ?? 0;

  const attention = dash
    ? [
        { label: "Admissions in progress", value: dash.admissions_in_progress, href: "/admissions", icon: "admissions" },
        { label: "Leaves pending", value: dash.staff_leaves_pending, href: "/leaves", icon: "leaves" },
        { label: "Gate passes", value: dash.gate_passes_pending, href: "/leaves", icon: "door" },
        { label: "Open incidents", value: dash.incidents_open, href: "/discipline", icon: "shield" },
      ]
    : [];

  const loadingCore = !dash && !error;

  return (
    <div className="space-y-5">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-panel border border-navy-800 bg-navy-900 text-white shadow-card">
        <Image
          src="/school-banner.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 via-navy-900/80 to-navy-800/40" aria-hidden />
        <div className="relative flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-300">
              {formatLongDate(today)}
            </p>
            <h1 className="mt-1.5 font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
              {greeting(today)}, {role}.
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-white/70">
              Here&apos;s what&apos;s happening across this branch today.
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-xl">
            {attention.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="group rounded-xl border border-white/10 bg-white/[0.06] p-3 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.12]"
              >
                <span className="flex items-center gap-1.5 text-white/60">
                  <Icon name={a.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="mt-1.5 block font-display text-[20px] font-extrabold leading-none tabular-nums">
                  {loadingCore ? "–" : a.value}
                </span>
                <span className="mt-1 block text-[10.5px] font-medium leading-tight text-white/60">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-danger/30 bg-danger-soft px-4 py-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            {error}
          </p>
          <Button variant="danger" onClick={load}>
            <Icon name="refresh" className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {/* ── What is waiting on this leader ───────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <ApprovalsWidget me={me} />
        <AdmissionQueueWidget role={me.role} />
      </div>

      {/* ── KPI tiles with trend sparklines ──────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Students"
          value={loadingCore ? "—" : String(dash?.students_active ?? 0)}
          icon="students"
          tone="brand"
          spark={enrollmentSeries}
          delta={momDelta(enrollmentSeries, "enrolments vs last month")}
          delay={0}
        />
        <KpiCard
          label="Total Classes"
          value={loadingCore ? "—" : String(dash?.classes ?? 0)}
          icon="layers"
          tone="violet"
          spark={classSeries}
          delta={momDelta(classSeries, "new sections vs last month")}
          delay={60}
        />
        <KpiCard
          label="Attendance"
          value={attendanceWeighted === null ? "—" : `${attendanceWeighted.toFixed(1)}%`}
          icon="attendance"
          tone={attendanceWeighted === null ? "sky" : attendanceWeighted >= 90 ? "emerald" : "amber"}
          spark={attendanceSeries}
          delta={momDelta(attendanceSeries, "vs last month")}
          hint={attendanceTotal > 0 ? `${attendanceTotal.toLocaleString("en-IN")} roll-call records` : "No roll calls yet"}
          delay={120}
        />
        <KpiCard
          label="Total Fee Collected"
          value={loadingCore ? "—" : inrCompact(fees?.collected ?? 0)}
          icon="fees"
          tone="emerald"
          spark={collectedSeries}
          delta={momDelta(collectedSeries, "vs last month")}
          hint={fees ? `${fees.invoice_count} invoices raised` : undefined}
          delay={180}
        />
      </div>

      {/* ── Quick access ─────────────────────────────────────────── */}
      <Card delay={210}>
        <CardHead
          icon="sparkles"
          title="Quick access"
          subtitle="Jump straight to the task you came here for."
        />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 lg:grid-cols-8">
          {QUICK_ACTIONS.filter((a) => canAccess(a.href, me.role)).map((a) => (
            <TiltCard key={a.label} maxTilt={8} scale={1.03} glare={false} className="h-full">
              <Link
                href={a.href}
                className="group flex h-full flex-col items-center gap-2.5 px-2 py-4 text-center"
              >
                <span className={`grid h-11 w-11 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${a.tone}`}>
                  <Icon name={a.icon} className="h-5 w-5" />
                </span>
                <span className="text-[12px] font-semibold leading-tight text-ink-2">{a.label}</span>
              </Link>
            </TiltCard>
          ))}
        </div>
      </Card>

      {/* ── Attendance rings · fee trend · collection status ─────── */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-4" delay={240}>
          {/* No action button here on purpose: the header reads as one clean
              block, and Roll call is already in Quick access. */}
          <CardHead
            icon="attendance"
            title="Attendance by Class"
            subtitle="Present rate across all recorded roll calls."
          />
          <div className="p-5">
            {attendance === null ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <Skeleton className="h-[86px] w-[86px] !rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <RingGrid
                data={rings}
                emptyMessage="No classes yet — create one from Classes & Sections."
              />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-4" delay={270}>
          <CardHead
            icon="reports"
            title="Fee Collection Trend"
            subtitle="Collection vs outstanding, by invoice due month."
            actions={
              <Link href="/fees" className="btn-soft">
                Open fees
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="p-5">
            {monthsLoading ? (
              <div className="flex items-end gap-2 pb-6" style={{ height: 248 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="w-full" style={{ height: `${25 + (i % 4) * 15}%` }} />
                ))}
              </div>
            ) : (
              <GroupedBars
                categories={feePoints.map((p) => p.label)}
                series={feeSeries}
                formatValue={(v) => inrCompact(v)}
                formatTick={(v) => inrCompact(v)}
                ariaLabel="Monthly fee collection and outstanding"
                emptyMessage="No invoices have been raised yet."
              />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-4" delay={300}>
          <CardHead icon="wallet" title="Collection Status" subtitle="Where this branch's billing stands." />
          <div className="p-5">
            {!fees ? (
              <div className="flex items-center gap-5">
                <Skeleton className="h-[132px] w-[132px] !rounded-full" />
                <div className="flex-1 space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-3.5 w-full" />)}
                </div>
              </div>
            ) : (
              <>
                <DonutRing
                  layout="column"
                  centerLabel="Collected"
                  centerValue={fees.collection_pct === null ? "—" : `${fees.collection_pct.toFixed(0)}%`}
                  showShare
                  segments={[
                    { label: "Collected", value: collected, color: CHART_SERIES[0] },
                    { label: "Outstanding", value: outstanding, color: CHART_SERIES[4] },
                  ]}
                  caption={
                    fees.invoice_count === 0
                      ? "No invoices have been raised in this branch yet."
                      : `${fees.invoice_count} invoice${fees.invoice_count === 1 ? "" : "s"} raised.`
                  }
                />
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                  <span>
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      Total invoiced
                    </span>
                    <span className="block font-display text-[15px] font-extrabold tabular-nums text-ink">
                      {inr(fees.invoiced)}
                    </span>
                  </span>
                  <Icon name="receipt" className="h-5 w-5 shrink-0 text-ink-3" />
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ── Exam comparison · operations · outbound log ──────────── */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-4" delay={330}>
          <CardHead
            icon="exams"
            title="Average Score by Exam"
            subtitle="Mean score per class, for the two largest exams."
            actions={
              <Link href="/exams" className="btn-soft">
                Open exams
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="p-5">
            {examScores === null ? (
              <div className="flex items-end gap-2 pb-6" style={{ height: 248 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="w-full" style={{ height: `${30 + (i % 3) * 15}%` }} />
                ))}
              </div>
            ) : examSeries.length === 0 ? (
              <EmptyState
                icon="exams"
                title="No marks entered yet"
                hint="Exam averages appear here once teachers record marks against an exam."
              />
            ) : (
              <GroupedBars
                categories={examCategories}
                series={examSeries}
                formatValue={(v) => `${v.toFixed(1)}%`}
                formatTick={(v) => `${v}%`}
                ariaLabel="Average score per class by exam"
                emptyMessage="No marks entered yet."
              />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-4" delay={360}>
          <CardHead icon="activity" title="Operations Snapshot" subtitle="Live status at a glance." />
          <div className="grid grid-cols-2 gap-px bg-line">
            <div className="flex flex-col items-center gap-1 bg-surface p-4">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <Icon name="hostel" className="h-4 w-4" />
              </span>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Hostel</p>
              {summary?.hostel.occupancy_pct === null || summary === null ? (
                <>
                  <p className="font-display text-[19px] font-extrabold leading-none text-ink-3">—</p>
                  <p className="text-[10.5px] text-ink-3">no beds configured</p>
                </>
              ) : (
                <>
                  <p className="font-display text-[19px] font-extrabold leading-none tabular-nums text-ink">
                    {summary.hostel.occupancy_pct.toFixed(0)}%
                  </p>
                  <p className="text-[10.5px] tabular-nums text-ink-3">
                    {summary.hostel.allocated} of {summary.hostel.capacity} beds
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col items-center gap-1 bg-surface p-4">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-50 text-accent-600">
                <Icon name="wallet" className="h-4 w-4" />
              </span>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Payroll</p>
              <p className="font-display text-[19px] font-extrabold leading-none tabular-nums text-ink">
                {summary ? inrCompact(summary.payroll_total_net) : "—"}
              </p>
              <p className="text-[10.5px] tabular-nums text-ink-3">
                {summary ? `${summary.payslip_count} payslips` : "…"}
              </p>
            </div>

            <div className="col-span-2 bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Admissions</span>
                <span className="text-[11.5px] font-semibold tabular-nums text-ink">
                  {dash?.admissions_in_progress ?? "—"} in progress
                </span>
              </div>
              {enrollmentSeries.length < 2 ? (
                <p className="mt-2 text-[11px] text-ink-3">Not enough history to plot a trend yet.</p>
              ) : (
                <SparkArea points={enrollmentSeries} color={CHART_SERIES[1]} height={40} label="Monthly enrolments" className="mt-1.5" />
              )}
            </div>

          </div>
        </Card>

        <Card className="xl:col-span-4" delay={390}>
          <CardHead
            icon="bell"
            title="Recent Outbound Messages"
            subtitle="Latest entries from the notification log."
            actions={
              <Link href="/notifications" className="btn-soft">
                View all
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {notices.length === 0 ? (
            <EmptyState
              icon="bell"
              title="Nothing sent yet"
              hint="Admission links, attendance alerts and payroll notices will show up here as they go out."
            />
          ) : (
            <ul className="divide-y divide-line">
              {notices.slice(0, 5).map((n) => {
                const meta = NOTICE_META[n.refType ?? ""] ?? { icon: "bell", label: n.channel };
                return (
                  <li key={n.id} className="flex items-start gap-3 px-5 py-3.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                      <Icon name={meta.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[12.5px] font-semibold text-ink">
                          {n.subject ?? `${meta.label} notification`}
                        </p>
                        <span className="shrink-0 text-[11px] text-ink-3">{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-2">{n.body}</p>
                    </div>
                    <Badge tone={n.status === "sent" ? "emerald" : n.status === "failed" ? "rose" : "amber"}>
                      {n.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── Role dashboards ─────────────────────────────────────────── */

function RoleHero({ me, subtitle }: { me: Me; subtitle: string }) {
  const [today] = useState(() => new Date());
  return (
    <section className="relative overflow-hidden rounded-panel border border-navy-800 bg-navy-900 p-5 text-white shadow-card sm:p-7">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-300">
        {formatLongDate(today)} · {ROLE_LABEL[me.role] ?? me.role}
      </p>
      <h1 className="mt-1.5 font-display text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
        {greeting(today)}{me.name ? `, ${me.name}` : ""}.
      </h1>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-white/70">{subtitle}</p>
    </section>
  );
}

/** Shortcuts every staff member has (Leaves, Staff and Discipline are open to all staff). */
function MyShortcuts({ me }: { me: Me }) {
  const links = [
    { href: "/gate", icon: "door", label: "Gate Desk" },
    { href: "/leaves", icon: "leaves", label: "Apply for leave" },
    { href: "/staff", icon: "wallet", label: "My payslips" },
    { href: "/discipline", icon: "shield", label: "Report a concern" },
    { href: "/timetable", icon: "timetable", label: "Timetable" },
    { href: "/students", icon: "students", label: "Students" },
    { href: "/attendance", icon: "attendance", label: "Attendance" },
    { href: "/fees", icon: "fees", label: "Fees" },
    { href: "/admissions", icon: "admissions", label: "Admissions" },
    { href: "/hostel", icon: "hostel", label: "Hostel" },
    { href: "/reports", icon: "reports", label: "Reports" },
  ].filter((l) => canAccess(l.href, me.role)).slice(0, 8);
  return (
    <Card>
      <CardHead icon="sparkles" title="Quick access" subtitle="Only the screens your role can open." />
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:p-5">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            <Icon name={l.icon} className="h-4 w-4 shrink-0 text-brand-700" />
            <span className="truncate">{l.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

const SUBTITLE: Record<string, string> = {
  [ROLE.OFFICE_SUPERINTENDENT]: "Admission approvals at your step, plus the fee picture.",
  [ROLE.ADMISSION_OFFICER]: "Applications waiting for links or document checks.",
  [ROLE.ACCOUNTS]: "Payments to verify, collections and who is overdue.",
  [ROLE.HR]: "Leave decisions waiting for you.",
  [ROLE.HOD]: "Your day, your department's leave and your lesson plans.",
  [ROLE.TEACHER]: "Your periods today, roll calls to take and lesson plans due.",
  [ROLE.WARDEN]: "The gate desk, passes waiting for you, hostel occupancy and tonight's roll call.",
  [ROLE.SECURITY]: "Who is out on a gate pass, who is due back late and who is visiting.",
  [ROLE.DISCIPLINE_OFFICER]: "Open and escalated safeguarding cases.",
};

function RoleDashboard({ me }: { me: Me }) {
  const r = me.role;
  const teaching = r === ROLE.TEACHER || r === ROLE.HOD;
  return (
    <div className="space-y-5">
      <RoleHero me={me} subtitle={SUBTITLE[r] ?? "Your work for today."} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {teaching && <TodayScheduleWidget me={me} />}
        {hasRole(me, R.ATTENDANCE_MARK) && <ClassesToMarkWidget />}
        {teaching && <LessonPlansWidget me={me} />}
        <AdmissionQueueWidget role={r} />
        {(r === ROLE.ACCOUNTS || r === ROLE.OFFICE_SUPERINTENDENT) && <FeesWidget me={me} />}
        {(r === ROLE.HR || r === ROLE.HOD) && <LeaveApprovalsWidget />}
        {(r === ROLE.WARDEN || r === ROLE.SECURITY) && <GateDeskWidget me={me} />}
        {r === ROLE.WARDEN && <WardenHostelWidget me={me} />}
        {(r === ROLE.WARDEN || r === ROLE.TEACHER) && <StudentLeaveWidget />}
        {r === ROLE.DISCIPLINE_OFFICER && <SafeguardingWidget />}
      </div>
      <MyShortcuts me={me} />
    </div>
  );
}

/** Home: leadership gets the analytics board + approvals; every other role its own work queue. */
export default function DashboardHome() {
  const { me } = useMe();
  if (!me) return null; // the shell shows the loading / error state
  if (hasRole(me, R.LEADERSHIP)) return <LeadershipBoard me={me} />;
  return <RoleDashboard me={me} />;
}
