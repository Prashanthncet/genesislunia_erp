"use client";

/**
 * Role-specific home widgets. Each widget calls ONLY endpoints its role may call
 * (lib/auth `R` groups mirror the backend @Roles). Any failure — 403 while another
 * module tightens access, 404 for an endpoint not built yet, network — hides the
 * widget instead of toasting, so a role never sees an error storm on its home page.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, ROLE, hasRole, type Me } from "@/lib/auth";
import { inr, inrCompact } from "@/lib/format";
import { Badge, Card, CardHead, EmptyState, Icon, Skeleton } from "@/components/ui";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** GET that resolves to `undefined` while loading, `null` on ANY error (widget hides). */
function useSafe<T>(path: string | null): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!path) { setData(null); return; }
    let live = true;
    setData(undefined);
    apiFetch<T>(path).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [path]);
  return data;
}

function Loading() {
  return <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
}

function CountRow({ href, icon, label, value, tone = "brand" }: { href: string; icon: string; label: string; value: number; tone?: "brand" | "warn" | "danger" | "ok" }) {
  const chip = { brand: "bg-brand-50 text-brand-700", warn: "bg-warn-soft text-warn-ink", danger: "bg-danger-soft text-danger-ink", ok: "bg-ok-soft text-ok-ink" }[tone];
  return (
    <Link href={href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${chip}`}><Icon name={icon} className="h-4 w-4" /></span>
      <span className="flex-1 text-[13px] font-medium text-ink-2">{label}</span>
      <span className="font-display text-[18px] font-bold tnum text-ink">{value}</span>
      <Icon name="chevronRight" className="h-4 w-4 text-ink-3" />
    </Link>
  );
}

/* ── Admissions: "Your queue" ────────────────────────────────── */

type Admission = { id: string; studentName: string | null; status: string; updatedAt?: string; createdAt: string };

/** Which admission statuses each role acts on (plan's 9-step workflow). */
export const ADMISSION_QUEUE: Record<string, { statuses: string[]; step: string }> = {
  [ROLE.ADMISSION_OFFICER]: { statuses: ["Published", "Submitted by Parent"], step: "Send links and validate documents" },
  [ROLE.OFFICE_SUPERINTENDENT]: { statuses: ["Pending Approval", "Fee Approved"], step: "Approve the form; assign roll no. and house" },
  [ROLE.ACCOUNTS]: { statuses: ["Payment Received"], step: "Verify the admission fee" },
  [ROLE.VICE_PRINCIPAL]: { statuses: ["Roll No Assigned"], step: "Vice Principal approval" },
  [ROLE.PRINCIPAL]: { statuses: ["VP Approved"], step: "Final approval" },
};

export function AdmissionQueueWidget({ role }: { role: string }) {
  const q = ADMISSION_QUEUE[role];
  const rows = useSafe<Admission[]>(hasRole({ role }, R.ADMISSION_READ) ? "/api/admissions" : null);
  if (!q || rows === null) return null;
  const mine = (rows ?? []).filter((a) => q.statuses.includes(a.status));
  return (
    <Card>
      <CardHead icon="admissions" title="Your admissions queue" subtitle={q.step}
        actions={<Link href="/admissions" className="btn-soft">Open<Icon name="chevronRight" className="h-3.5 w-3.5" /></Link>} />
      {rows === undefined ? <Loading /> : (
        <>
          <div className="divide-y divide-line">
            {q.statuses.map((s) => (
              <CountRow key={s} href="/admissions" icon="admissions" label={s} value={mine.filter((a) => a.status === s).length}
                tone={mine.some((a) => a.status === s) ? "warn" : "ok"} />
            ))}
          </div>
          {mine.length > 0 && (
            <ul className="border-t border-line px-5 py-3 text-[12.5px] text-ink-2">
              {mine.slice(0, 5).map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-1">
                  <span className="truncate">{a.studentName ?? "Unnamed applicant"}</span>
                  <span className="shrink-0 text-ink-3">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

/* ── Leadership: approvals waiting ───────────────────────────── */

type Leave = { id: string; status: string; can_decide?: boolean };
type Pass = { id: string; status: string };
type Incident = { id: string; status: string; severity?: string };

export function ApprovalsWidget({ me }: { me: Me }) {
  const staffLeaves = useSafe<Leave[]>(hasRole(me, R.LEAVE_APPROVE) ? "/api/staff-leaves?status=Pending" : null);
  const studentLeaves = useSafe<Leave[]>(hasRole(me, R.STUDENT_LEAVE_APPROVE) ? "/api/student-leaves?status=Pending" : null);
  const passes = useSafe<Pass[]>(hasRole(me, R.GATE_PASS_APPROVE) ? "/api/gate-passes" : null);
  const incidents = useSafe<Incident[]>(hasRole(me, R.SAFEGUARDING) ? "/api/discipline/incidents" : null);

  const items: { href: string; icon: string; label: string; value: number }[] = [];
  if (Array.isArray(staffLeaves)) items.push({ href: "/leaves", icon: "leaves", label: "Staff leave to decide", value: staffLeaves.filter((l) => l.can_decide ?? l.status === "Pending").length });
  if (Array.isArray(studentLeaves)) items.push({ href: "/leaves", icon: "students", label: "Student leave pending", value: studentLeaves.length });
  if (Array.isArray(passes)) {
    const waiting = me.role === ROLE.PRINCIPAL ? ["Warden Approved"] : me.role === ROLE.WARDEN ? ["Pending"] : ["Pending", "Warden Approved"];
    items.push({ href: "/gate", icon: "door", label: "Gate passes awaiting approval", value: passes.filter((p) => waiting.includes(p.status)).length });
  }
  if (Array.isArray(incidents)) items.push({ href: "/discipline", icon: "shield", label: "Escalated safeguarding cases", value: incidents.filter((i) => i.status === "Escalated").length });

  const loading = [staffLeaves, studentLeaves, passes, incidents].some((x) => x === undefined);
  if (!loading && items.length === 0) return null;
  return (
    <Card>
      <CardHead icon="check" title="Approvals waiting" subtitle="Decisions that are with you or your office." />
      {loading && items.length === 0 ? <Loading /> : (
        <div className="divide-y divide-line">
          {items.map((i) => <CountRow key={i.label} {...i} tone={i.value ? "warn" : "ok"} />)}
        </div>
      )}
    </Card>
  );
}

/* ── Teaching: today's schedule, classes to mark, lesson plans ─ */

type DayEntry = {
  period_number: number; start_time: string | null; end_time: string | null;
  kind: "lesson" | "cover" | "relieved" | "break" | "free";
  subject: string | null; class_id: string | null; class_name: string | null; room_name: string | null; note: string | null;
};

export function TodayScheduleWidget({ me }: { me: Me }) {
  const data = useSafe<{ day?: string; entries?: DayEntry[] }>(me.staff ? "/api/timetable/me/today" : null);
  if (data === null) {
    return (
      <Card>
        <CardHead icon="timetable" title="Today's schedule" />
        <EmptyState icon="timetable" title="Personal timetable not available"
          hint={me.staff ? "Your day view isn't available yet — open the Timetable module for the class grid." : "No staff record is linked to this login, so there is no personal timetable."} />
      </Card>
    );
  }
  const entries = (data?.entries ?? []).filter((e) => e.kind !== "free");
  return (
    <Card>
      <CardHead icon="timetable" title="Today's schedule" subtitle={data?.day}
        actions={<Link href="/timetable" className="btn-soft">Timetable</Link>} />
      {data === undefined ? <Loading /> : entries.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing scheduled today" />
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li key={`${e.period_number}-${e.kind}`} className={`flex items-center gap-3 px-5 py-2.5 ${e.kind === "relieved" || e.kind === "break" ? "opacity-60" : ""}`}>
              <span className="w-12 shrink-0 text-[11.5px] font-semibold tnum text-ink-3">{e.start_time ?? `P${e.period_number}`}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {e.kind === "break" ? e.note ?? "Break" : `${e.subject ?? "—"}${e.class_name ? ` · ${e.class_name}` : ""}`}
                </span>
                {e.kind !== "break" && e.note && <span className="block truncate text-[11.5px] text-ink-3">{e.note}</span>}
              </span>
              {e.kind === "cover" && <Badge tone="amber">Cover</Badge>}
              {e.kind === "relieved" && <Badge tone="slate">Covered</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type MyClass = { id: string; name: string; section: string | null; can_mark?: boolean };

export function ClassesToMarkWidget() {
  const classes = useSafe<MyClass[]>("/api/attendance/my-classes");
  const [status, setStatus] = useState<Record<string, boolean | null>>({});
  useEffect(() => {
    if (!Array.isArray(classes)) return;
    const date = todayIso();
    classes.filter((c) => c.can_mark !== false).slice(0, 12).forEach((c) => {
      apiFetch<unknown[]>(`/api/attendance?class_id=${encodeURIComponent(c.id)}&date=${date}`)
        .then((rows) => setStatus((s) => ({ ...s, [c.id]: Array.isArray(rows) && rows.length > 0 })))
        .catch(() => setStatus((s) => ({ ...s, [c.id]: null })));
    });
  }, [classes]);
  if (classes === null) return null;
  const list = (classes ?? []).filter((c) => c.can_mark !== false).slice(0, 12);
  const pending = list.filter((c) => status[c.id] === false).length;
  return (
    <Card>
      <CardHead icon="attendance" title="Attendance today" subtitle={classes === undefined ? undefined : `${pending} class${pending === 1 ? "" : "es"} still to mark`}
        actions={<Link href="/attendance" className="btn-soft">Mark</Link>} />
      {classes === undefined ? <Loading /> : list.length === 0 ? (
        <EmptyState icon="attendance" title="No classes to mark" />
      ) : (
        <ul className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-3">
          {list.map((c) => {
            const s = status[c.id];
            return (
              <li key={c.id}>
                <Link href="/attendance" className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${
                  s === false ? "border-warn-line bg-warn-soft text-warn-ink" : s ? "border-ok-line bg-ok-soft text-ok-ink" : "border-line text-ink-2"
                }`}>
                  <span className="truncate font-semibold">{c.name}{c.section ? ` ${c.section}` : ""}</span>
                  <Icon name={s ? "check" : s === false ? "alert" : "clock"} className="h-3.5 w-3.5 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

type LessonPlan = { id: string; topic: string; date: string; status: string; syllabus?: { subject?: { name: string } } };

export function LessonPlansWidget({ me }: { me: Me }) {
  const plans = useSafe<LessonPlan[]>(me.staff ? `/api/academics/lesson-plans?teacher_id=${encodeURIComponent(me.staff.id)}` : null);
  if (plans === null) return null;
  const today = todayIso();
  const pending = (plans ?? []).filter((p) => p.status !== "Completed" && p.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = (plans ?? []).filter((p) => p.status !== "Completed" && p.date > today).length;
  return (
    <Card>
      <CardHead icon="book" title="Lesson plans" subtitle={plans === undefined ? undefined : `${pending.length} due or overdue · ${upcoming} upcoming`}
        actions={<Link href="/academics" className="btn-soft">Open</Link>} />
      {plans === undefined ? <Loading /> : pending.length === 0 ? (
        <EmptyState icon="book" title="Nothing overdue" hint="Every plan up to today is marked complete." />
      ) : (
        <ul className="divide-y divide-line">
          {pending.slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[12.5px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{p.topic}</span>
                <span className="block text-ink-3">{p.syllabus?.subject?.name ?? "Lesson"} · {p.date}</span>
              </span>
              <Badge tone={p.date < today ? "rose" : "amber"}>{p.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Welfare: gate desk, visitors, hostel ────────────────────── */

type OutPass = { id: string; type: string; outTime: string; expectedInTime: string | null; late?: boolean; student?: { fullName: string } | null };
type Visitor = { id: string; visitorName: string; whomToMeet: string; inTime: string; outTime: string | null };
type RecordsLite = { total: number; rows: { id: string; late: boolean }[] };

const hhmm = (s: string | null | undefined) => (s ? s.slice(11, 16) || s : "—");

/**
 * Gate desk at a glance (warden + security): who is out and due back, passes issued but not
 * yet used, late returns and visitors on campus. Everything links to the Gate Desk.
 */
export function GateDeskWidget({ me }: { me: Me }) {
  const desk = hasRole(me, R.GATE_DESK);
  const today = todayIso();
  const out = useSafe<OutPass[]>(desk ? "/api/gate-passes/out" : null);
  const issued = useSafe<OutPass[]>(desk ? "/api/gate-passes?status=Approved" : null);
  const lateBack = useSafe<RecordsLite>(desk ? `/api/gate-passes/records?status=Returned&late=1&from=${today}&to=${today}` : null);
  const visitors = useSafe<Visitor[]>(hasRole(me, R.HOSTEL_DESK) ? `/api/hostel/visitors?date=${today}` : null);
  if (out === null && visitors === null) return null;
  const inside = Array.isArray(visitors) ? visitors.filter((v) => !v.outTime) : [];
  const overdue = Array.isArray(out) ? out.filter((p) => p.late) : [];
  const loading = out === undefined && visitors === undefined;
  return (
    <Card className="lg:col-span-2">
      <CardHead icon="door" title="Gate desk" subtitle="Who is out, who is due back and who is visiting — right now."
        actions={<Link href="/gate" className="btn-soft">Open Gate Desk<Icon name="chevronRight" className="h-3.5 w-3.5" /></Link>} />
      {loading ? <Loading /> : (
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="divide-y divide-line border-line md:border-r">
            {Array.isArray(out) && <CountRow href="/gate" icon="door" label="Students out — awaiting check-in" value={out.length} tone={out.length ? "warn" : "ok"} />}
            {Array.isArray(out) && <CountRow href="/gate" icon="alert" label="Overdue (past expected return)" value={overdue.length} tone={overdue.length ? "danger" : "ok"} />}
            {lateBack && <CountRow href="/gate" icon="clock" label="Returned late today" value={lateBack.total} tone={lateBack.total ? "danger" : "ok"} />}
            {Array.isArray(issued) && <CountRow href="/gate" icon="key" label="Passes issued, not yet used" value={issued.length} />}
            {Array.isArray(visitors) && <CountRow href="/gate" icon="user" label="Visitors on campus" value={inside.length} tone={inside.length ? "warn" : "ok"} />}
          </div>
          <div className="border-t border-line md:border-t-0">
            <p className="px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Out now</p>
            {!Array.isArray(out) || out.length === 0 ? (
              <EmptyState icon="check" title="Everyone is on campus" />
            ) : (
              <ul className="px-5 py-2 text-[12.5px]">
                {[...out].sort((a, b) => Number(!!b.late) - Number(!!a.late)).slice(0, 7).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-ink">{p.student?.fullName ?? p.type}</span>
                    {p.late
                      ? <Badge tone="rose">Late · due {hhmm(p.expectedInTime)}</Badge>
                      : <span className="shrink-0 tnum text-ink-3">due {hhmm(p.expectedInTime)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

type HostelLite = { id: string; name: string; capacity: number; occupied: number; free: number };
type Roster = { already_marked: boolean; roster: { status: string }[] };

/** Warden: passes waiting for their approval, hostel occupancy and tonight's roll call. */
export function WardenHostelWidget({ me }: { me: Me }) {
  const pending = useSafe<{ id: string }[]>(hasRole(me, R.GATE_PASS_APPROVE) ? "/api/gate-passes?status=Pending" : null);
  const hostels = useSafe<HostelLite[]>(hasRole(me, R.HOSTEL_ADMIN) ? "/api/hostel" : null);
  const [roll, setRoll] = useState<Record<string, Roster | null>>({});
  useEffect(() => {
    if (!Array.isArray(hostels)) return;
    const date = todayIso();
    hostels.forEach((h) => {
      apiFetch<Roster>(`/api/hostel/roll-call?hostel_id=${encodeURIComponent(h.id)}&date=${date}&session=Night`)
        .then((r) => setRoll((s) => ({ ...s, [h.id]: r })))
        .catch(() => setRoll((s) => ({ ...s, [h.id]: null })));
    });
  }, [hostels]);
  if (pending === null && hostels === null) return null;
  const cap = Array.isArray(hostels) ? hostels.reduce((a, h) => a + h.capacity, 0) : 0;
  const occ = Array.isArray(hostels) ? hostels.reduce((a, h) => a + h.occupied, 0) : 0;
  return (
    <Card>
      <CardHead icon="hostel" title="Hostel tonight" subtitle={cap ? `${occ} of ${cap} beds occupied (${Math.round((occ / cap) * 100)}%)` : undefined}
        actions={<Link href="/hostel" className="btn-soft">Hostel</Link>} />
      {pending === undefined && hostels === undefined ? <Loading /> : (
        <>
          {Array.isArray(pending) && (
            <div className="border-b border-line">
              <CountRow href="/gate" icon="door" label="Gate passes waiting for your approval" value={pending.length} tone={pending.length ? "warn" : "ok"} />
            </div>
          )}
          {Array.isArray(hostels) && (hostels.length === 0 ? <EmptyState icon="hostel" title="No hostels set up" /> : (
            <ul className="divide-y divide-line">
              {hostels.map((h) => {
                const r = roll[h.id];
                const pct = h.capacity ? Math.round((h.occupied / h.capacity) * 100) : 0;
                const absent = r?.roster.filter((x) => x.status === "Absent").length ?? 0;
                return (
                  <li key={h.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{h.name}</span>
                      {r === undefined ? <Skeleton className="h-5 w-24" />
                        : r === null ? <Badge tone="slate">Roll call n/a</Badge>
                        : r.already_marked
                          ? <Badge tone={absent ? "rose" : "emerald"}>Night roll call done{absent ? ` · ${absent} absent` : ""}</Badge>
                          : <Badge tone="amber">Night roll call due</Badge>}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${h.name} occupancy`}>
                        <div className="h-full rounded-full bg-brand-700" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-[11.5px] tnum text-ink-3">{h.occupied}/{h.capacity} beds</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
        </>
      )}
    </Card>
  );
}

/* ── Accounts / OS: fee collection + defaulters ──────────────── */

type FeesReport = { invoiced: number; collected: number; outstanding: number; collection_pct: number | null; invoice_count: number };
type Defaulter = { student_id: string; full_name: string; class_name: string; overdue_amount: number; overdue_invoices: number };

export function FeesWidget({ me }: { me: Me }) {
  const fees = useSafe<FeesReport>(hasRole(me, R.FEES_READ) ? "/api/reports/fees" : null);
  const defaulters = useSafe<Defaulter[]>(hasRole(me, R.FEES_READ) ? "/api/reports/defaulters" : null);
  if (fees === null && defaulters === null) return null;
  return (
    <Card>
      <CardHead icon="fees" title="Fee collection" subtitle={fees ? `${fees.collection_pct == null ? "—" : `${fees.collection_pct.toFixed(0)}%`} collected of ${inrCompact(fees.invoiced)}` : undefined}
        actions={<Link href="/fees" className="btn-soft">Fees</Link>} />
      {fees === undefined ? <Loading /> : fees && (
        <dl className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-surface p-4"><dt className="text-[11.5px] text-ink-3">Collected</dt><dd className="font-display text-[20px] font-bold tnum text-ok-ink">{inrCompact(fees.collected)}</dd></div>
          <div className="bg-surface p-4"><dt className="text-[11.5px] text-ink-3">Outstanding</dt><dd className="font-display text-[20px] font-bold tnum text-danger">{inrCompact(fees.outstanding)}</dd></div>
        </dl>
      )}
      {Array.isArray(defaulters) && (
        <div className="border-t border-line">
          <p className="px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Top defaulters ({defaulters.length})</p>
          {defaulters.length === 0 ? <p className="px-5 py-3 text-[12.5px] text-ink-3">Nobody is overdue.</p> : (
            <ul className="px-5 py-2 text-[12.5px]">
              {defaulters.slice(0, 5).map((d) => (
                <li key={d.student_id} className="flex justify-between gap-3 py-1">
                  <span className="truncate text-ink">{d.full_name} <span className="text-ink-3">· {d.class_name}</span></span>
                  <span className="shrink-0 font-semibold tnum text-danger">{inr(d.overdue_amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── HR / HOD: leave approvals ───────────────────────────────── */

type StaffLeave = { id: string; status: string; leaveType?: string; startDate?: string; endDate?: string; can_decide?: boolean; staff?: { name: string } };

export function LeaveApprovalsWidget() {
  const rows = useSafe<StaffLeave[]>("/api/staff-leaves?status=Pending");
  if (rows === null) return null;
  const mine = (rows ?? []).filter((l) => l.can_decide ?? true);
  return (
    <Card>
      <CardHead icon="leaves" title="Leave approvals" subtitle={rows === undefined ? undefined : `${mine.length} waiting for you`}
        actions={<Link href="/leaves" className="btn-soft">Decide</Link>} />
      {rows === undefined ? <Loading /> : mine.length === 0 ? <EmptyState icon="check" title="No leave waiting" /> : (
        <ul className="divide-y divide-line">
          {mine.slice(0, 6).map((l) => (
            <li key={l.id} className="flex justify-between gap-3 px-5 py-2.5 text-[12.5px]">
              <span className="truncate font-semibold text-ink">{l.staff?.name ?? "Staff member"}</span>
              <span className="shrink-0 text-ink-3">{l.leaveType ?? "Leave"} · {l.startDate}{l.endDate && l.endDate !== l.startDate ? ` → ${l.endDate}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type StudentLeave = { id: string; leaveType: string; startDate: string; student?: { fullName: string } };

export function StudentLeaveWidget() {
  const rows = useSafe<StudentLeave[]>("/api/student-leaves?status=Pending");
  if (rows === null) return null;
  return (
    <Card>
      <CardHead icon="students" title="Student leave requests" subtitle={rows === undefined ? undefined : `${rows.length} pending`}
        actions={<Link href="/leaves" className="btn-soft">Review</Link>} />
      {rows === undefined ? <Loading /> : rows.length === 0 ? <EmptyState icon="check" title="Nothing pending" /> : (
        <ul className="divide-y divide-line">
          {rows.slice(0, 6).map((l) => (
            <li key={l.id} className="flex justify-between gap-3 px-5 py-2.5 text-[12.5px]">
              <span className="truncate font-semibold text-ink">{l.student?.fullName ?? "Student"}</span>
              <span className="shrink-0 text-ink-3">{l.leaveType} · from {l.startDate}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Safeguarding lead ───────────────────────────────────────── */

export function SafeguardingWidget() {
  const rows = useSafe<Incident[]>("/api/discipline/incidents");
  if (rows === null) return null;
  const by = (s: string) => (rows ?? []).filter((i) => i.status === s).length;
  return (
    <Card>
      <CardHead icon="shield" title="Safeguarding cases" subtitle="Open work in the incident log."
        actions={<Link href="/discipline" className="btn-soft">Case log</Link>} />
      {rows === undefined ? <Loading /> : (
        <div className="divide-y divide-line">
          <CountRow href="/discipline" icon="alert" label="Escalated" value={by("Escalated")} tone={by("Escalated") ? "danger" : "ok"} />
          <CountRow href="/discipline" icon="shield" label="Open" value={by("Open")} tone={by("Open") ? "warn" : "ok"} />
          <CountRow href="/discipline" icon="eye" label="Under review" value={by("Under Review")} />
          <CountRow href="/discipline" icon="flag" label="High / critical, not closed" value={(rows ?? []).filter((i) => i.status !== "Closed" && (i.severity === "High" || i.severity === "Critical")).length} tone="danger" />
        </div>
      )}
    </Card>
  );
}
