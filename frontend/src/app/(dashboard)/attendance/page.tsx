"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, EmptyState, Icon, Input, Modal, PageHeader, Reveal, Select, useToast } from "@/components/ui";
import { R, ROLE, hasRole, isPortal, useMe } from "@/lib/auth";

import { TableView } from "@/components/TableView";
import {
  CardBody, CardEmpty, CardGrid, CardTitle, Chip, Monogram, RecordCard, Ring, StatusPill, initials, toneFor, type Tone,
} from "@/components/RecordCard";

/** From /attendance/my-classes: the caller's class-teacher classes come first. */
type ClassItem = { id: string; name: string; section: string | null; _count?: { students: number }; can_mark?: boolean; is_class_teacher?: boolean };
type Student = { id: string; admissionNo: string; fullName: string; rollNo: string | null; class?: { name: string } };
type AttendanceRecord = { studentId: string; status: "Present" | "Absent" | "Late" | "Leave" };

/** GET /api/attendance/student/:id/calendar */
type CalendarResponse = {
  student: { id: string; full_name: string; roll_no: string | null; admission_no: string; class_name: string | null };
  month: string;
  days: { date: string; status: string | null }[];
  summary: { present: number; absent: number; late: number; leave: number; marked: number; percentage: number | null };
  overall: { marked: number; percentage: number | null };
};
/** GET /api/attendance/absentees */
type AbsenteeReport = {
  date: string;
  total_absent: number;
  classes: {
    class_id: string; class_name: string; marked: number;
    absentees: { record_id: string; student_id: string; full_name: string; roll_no: string | null; admission_no: string; contact: string | null; notified: boolean }[];
  }[];
};
/** GET /api/attendance/low */
type LowReport = {
  threshold: number;
  students: { student_id: string; full_name: string; roll_no: string | null; admission_no: string; class_id: string | null; class_name: string | null; marked: number; attended: number; absent: number; percentage: number }[];
};

/** Mirrors the backend read group for attendance screens. */
const ATTENDANCE_READ: string[] = [
  ...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.HOD, ROLE.TEACHER, ROLE.WARDEN, ROLE.DISCIPLINE_OFFICER,
];

/** One row of the monthly register returned by GET /api/attendance/register. */
type RegisterStudent = {
  id: string;
  fullName: string;
  rollNo: string | null;
  /** date (YYYY-MM-DD) → status, only for days that were actually marked. */
  days: Record<string, string>;
  present: number;
  marked: number;
};
type RegisterResponse = { month: string; class_id: string; dates: string[]; students: RegisterStudent[] };

/** One row of GET /api/reports/attendance — real per-class rate. */
type ClassRate = { class_id: string; class_name: string; section: string | null; attendance_pct: number | null; total_records: number };

const STATUS_TONE: Record<string, { dot: string; label: string }> = {
  Present: { dot: "bg-ok", label: "P" },
  Absent: { dot: "bg-danger", label: "A" },
  Late: { dot: "bg-warn", label: "L" },
  Leave: { dot: "bg-accent-500", label: "Lv" },
};

const STATUS_CONFIG = {
  Present: { color: "emerald", bg: "bg-ok-soft", border: "border-ok-line", text: "text-ok-ink", dot: "bg-ok" },
  Absent: { color: "rose", bg: "bg-danger-soft", border: "border-danger-line", text: "text-danger-ink", dot: "bg-danger" },
  Late: { color: "amber", bg: "bg-warn-soft", border: "border-warn-line", text: "text-warn-ink", dot: "bg-warn" },

};

/** Roll-call tile styling per status (literal classes so Tailwind keeps them). */
const ROLL_TILE: Record<"Present" | "Absent" | "Late", { tone: Tone; tint: string; on: string; icon: string }> = {
  Present: { tone: "ok", tint: "bg-ok-soft/40", on: "bg-ok text-white shadow-soft", icon: "check" },
  Absent: { tone: "danger", tint: "bg-danger-soft/40", on: "bg-danger text-white shadow-soft", icon: "x" },
  Late: { tone: "warn", tint: "bg-warn-soft/50", on: "bg-warn text-white shadow-soft", icon: "clock" },
};

/** Day-cell styling in the monthly heat card. */
const HEAT_CELL: Record<string, string> = {
  Present: "bg-ok-soft text-ok-ink",
  Absent: "bg-danger-soft text-danger-ink",
  Late: "bg-warn-soft text-warn-ink",
  Leave: "bg-accent-50 text-accent-700",
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function AttendancePage() {
  const { me, loading } = useMe();
  if (loading) return <div className="p-6 text-sm text-ink-3">Loading…</div>;
  if (isPortal(me)) return <PortalAttendance />;
  if (!hasRole(me, ATTENDANCE_READ)) {
    return (
      <div className="p-6">
        <EmptyState icon="lock" title="You don't have access to this page" hint="Attendance is available to teaching staff, leadership and the office." />
      </div>
    );
  }
  return <StaffAttendance />;
}

/** Parent / student: read-only month calendar for each child (or self). */
function PortalAttendance() {
  const { me } = useMe();
  const kids = me?.role === ROLE.STUDENT && me.student
    ? [{ id: me.student.id, name: me.student.fullName }]
    : (me?.children ?? []).map((c) => ({ id: c.id, name: c.fullName }));
  const [sel, setSel] = useState("");
  const current = sel || kids[0]?.id || "";
  return (
    <div className="relative min-h-screen p-6 space-y-6">
      <PageHeader icon="attendance" title="Attendance" subtitle="Day-by-day attendance and the month's percentage" />
      {kids.length === 0 ? (
        <EmptyState icon="user" title="No linked student" hint="Ask the school office to link your login to your child." />
      ) : (
        <div className="space-y-4">
          {kids.length > 1 && (
            <Select aria-label="Choose child" value={current} onChange={(e) => setSel(e.target.value)} className="w-auto">
              {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Select>
          )}
          {current && <div className="rounded-xl border border-line bg-white p-5 shadow-sm"><StudentCalendar studentId={current} /></div>}
        </div>
      )}
    </div>
  );
}

/** Month grid for one student: per-day status + the month's attendance %. */
function StudentCalendar({ studentId }: { studentId: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    apiFetch<CalendarResponse>(`/api/attendance/student/${studentId}/calendar?month=${month}`)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) { setData(null); setError(e instanceof Error ? e.message : "Load failed"); } });
    return () => { live = false; };
  }, [studentId, month]);

  const shift = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const pctValue = data?.summary.percentage;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{data?.student.full_name ?? "Student"}</p>
          <p className="text-xs text-ink-3">
            {data?.student.class_name ?? ""}{data?.student.roll_no ? ` · Roll ${data.student.roll_no}` : ""}
            {data?.overall.percentage != null ? ` · ${data.overall.percentage}% overall (${data.overall.marked} days)` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="soft" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="chevronLeft" className="h-4 w-4" /></Button>
          <Input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" />
          <Button size="sm" variant="soft" onClick={() => shift(1)} aria-label="Next month"><Icon name="chevronRight" className="h-4 w-4" /></Button>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {([
              ["Attendance", pctValue != null ? `${pctValue}%` : "—"],
              ["Present", data?.summary.present ?? 0],
              ["Absent", data?.summary.absent ?? 0],
              ["Late", data?.summary.late ?? 0],
              ["Leave", data?.summary.leave ?? 0],
            ] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{k}</p>
                <p className="tnum text-lg font-bold text-ink">{v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-surface-2 p-2">
            <div className="grid grid-cols-7 gap-1" aria-hidden>
              {WEEKDAYS.map((w, i) => <span key={i} className="text-center text-[11px] font-semibold uppercase text-ink-3">{w}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1" role="list" aria-label="Daily attendance">
              {Array.from({ length: firstWeekday }, (_, i) => <span key={`p${i}`} aria-hidden />)}
              {(data?.days ?? []).map((d) => {
                const label = `${d.date}: ${d.status ?? "not marked"}`;
                return (
                  <span
                    key={d.date}
                    role="listitem"
                    title={label}
                    aria-label={label}
                    className={`tnum flex h-10 flex-col items-center justify-center rounded-md text-[12px] font-semibold ${
                      d.status ? HEAT_CELL[d.status] ?? "bg-surface text-ink-2" : "bg-surface text-ink-3"
                    }`}
                  >
                    {Number(d.date.slice(8))}
                    <span className="text-[9.5px] font-bold leading-none">{d.status ? STATUS_TONE[d.status]?.label ?? "" : ""}</span>
                  </span>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-ink-2">
            {Object.entries(STATUS_TONE).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${v.dot}`} /> {k}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StaffAttendance() {
  const { me } = useMe();
  const canMark = hasRole(me, R.ATTENDANCE_MARK);
  const canReports = hasRole(me, R.REPORTS);
  const [calendarFor, setCalendarFor] = useState<{ id: string; name: string } | null>(null);
  const [absentees, setAbsentees] = useState<AbsenteeReport | null>(null);
  const [low, setLow] = useState<LowReport | null>(null);
  const [threshold, setThreshold] = useState(75);
  const [lowClass, setLowClass] = useState("");
  const [lowFrom, setLowFrom] = useState("");
  const [lowTo, setLowTo] = useState("");
  const [view, setView] = useState<"mark" | "register" | "analytics" | "absentees" | "low">("mark");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const toast = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("");

  const [register, setRegister] = useState<RegisterResponse | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [classRates, setClassRates] = useState<ClassRate[]>([]);

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  useEffect(() => {
    const loadClasses = async () => {
      try {
        // Only the classes this login may work with (teachers: the ones they teach).
        const data = await apiFetch<ClassItem[]>("/api/attendance/my-classes");
        const list = Array.isArray(data) ? data : [];
        setClasses(list);
        if (list.length > 0) setSelectedClass(list[0].id);
      } catch (e) {
        console.error("Failed to load classes:", e);
      }
    };
    loadClasses();
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!selectedClass || !date) return;
    setLoading(true);
    try {
      const [studsRes, att] = await Promise.all([
        apiFetch<{ data: Student[] } | Student[]>(`/api/students?class_id=${selectedClass}&page_size=200`),
        apiFetch<AttendanceRecord[]>(`/api/attendance?class_id=${selectedClass}&date=${date}`),
      ]);
      const list = Array.isArray(studsRes) ? studsRes : (studsRes?.data ?? []);
      setStudents(list);
      const map: Record<string, string> = {};
      for (const r of att ?? []) map[r.studentId] = r.status;
      setAttendance(map);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [selectedClass, date]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // The monthly register is a real endpoint (GET /api/attendance/register) — the
  // page used to render a "coming soon" panel while the API sat unused.
  const loadRegister = useCallback(async () => {
    if (!selectedClass || !month) return;
    setRegisterLoading(true);
    try {
      const [reg, rates] = await Promise.all([
        apiFetch<RegisterResponse>(`/api/attendance/register?class_id=${selectedClass}&month=${month}`),
        canReports ? apiFetch<ClassRate[]>(`/api/reports/attendance?from=${month}-01`) : Promise.resolve([] as ClassRate[]),
      ]);
      setRegister(reg);
      setClassRates(Array.isArray(rates) ? rates : []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Register load failed");
    } finally {
      setRegisterLoading(false);
    }
  }, [selectedClass, month, canReports]);

  useEffect(() => {
    if (view === "register" || view === "analytics") loadRegister();
  }, [view, loadRegister]);

  const loadAbsentees = useCallback(async () => {
    try {
      setAbsentees(await apiFetch<AbsenteeReport>(`/api/attendance/absentees?date=${date}`));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Absentee report failed");
    }
  }, [date]);
  const loadLow = useCallback(async () => {
    const q = new URLSearchParams({ threshold: String(threshold) });
    if (lowClass) q.set("class_id", lowClass);
    if (lowFrom) q.set("from", lowFrom);
    if (lowTo) q.set("to", lowTo);
    try {
      setLow(await apiFetch<LowReport>(`/api/attendance/low?${q.toString()}`));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Low-attendance report failed");
    }
  }, [threshold, lowClass, lowFrom, lowTo]);
  useEffect(() => { if (view === "absentees") loadAbsentees(); }, [view, loadAbsentees]);
  useEffect(() => { if (view === "low") loadLow(); }, [view, loadLow]);

  const markAll = (status: string) => {
    const map: Record<string, string> = {};
    for (const s of students) map[s.id] = status;
    setAttendance(map);
  };

  const save = async () => {
    if (!students.length) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await apiFetch<{ count: number; notified: number; notify_skipped: number; notify_failed: number }>("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          class_id: selectedClass,
          date,
          records: students.map((s) => ({ student_id: s.id, status: attendance[s.id] ?? "Present" })),
        }),
      });
      const notes = res.notified || res.notify_skipped || res.notify_failed
        ? ` · ${res.notified} parent notice${res.notified === 1 ? "" : "s"} sent${res.notify_skipped ? `, ${res.notify_skipped} without contact` : ""}${res.notify_failed ? `, ${res.notify_failed} failed` : ""}`
        : "";
      setMessage(`Attendance saved successfully ✓${notes}`);
      await loadAttendance();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const notifyAbsent = async () => {
    setNotifyLoading(true);
    try {
      const res = await apiFetch<{ notified: number; skipped: number; failed: number }>("/api/attendance/notify-absent", {
        method: "POST",
        body: JSON.stringify({ date, class_id: selectedClass }),
      });
      setMessage(
        res.notified + res.skipped + res.failed === 0
          ? "No pending absence notices — parents are notified automatically when you save"
          : `Absence notices re-sent to ${res.notified} parents${res.skipped ? ` (${res.skipped} without contact)` : ""}${res.failed ? ` · ${res.failed} failed` : ""}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Notify failed");
    } finally {
      setNotifyLoading(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (!filterStatus) return true;
    return attendance[s.id] === filterStatus;
  });

  // A student with no saved record is shown in the mark table as Present, so the
  // tally must count the *effective* status — otherwise the cards read "Present 0"
  // while every row below is flagged Present.
  const effectiveStatus = (id: string) => attendance[id] ?? "Present";
  const presentCount = students.filter((s) => effectiveStatus(s.id) === "Present").length;
  const absentCount = students.filter((s) => effectiveStatus(s.id) === "Absent").length;
  const lateCount = students.filter((s) => effectiveStatus(s.id) === "Late").length;

  const markedCount = Object.keys(attendance).length;
  const attendanceRate = markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0;

  // ── Derived register analytics: every number below comes from real records ──
  const regStudents = register?.students ?? [];
  const regDates = register?.dates ?? [];
  const totalMarks = regStudents.reduce((s, r) => s + r.marked, 0);
  const totalPresent = regStudents.reduce((s, r) => s + r.present, 0);
  const totalAbsent = regStudents.reduce(
    (s, r) => s + Object.values(r.days).filter((v) => v === "Absent").length,
    0,
  );
  /** A day on which every enrolled student was marked Present. */
  const perfectDays = regDates.filter((d) =>
    regStudents.length > 0 && regStudents.every((r) => r.days[d] === "Present"),
  ).length;
  const registerRate = totalMarks > 0 ? Math.round((totalPresent / totalMarks) * 100) : 0;
  /** Average absent days per student across the month. */
  const avgAbsentDays = regStudents.length > 0 ? (totalAbsent / regStudents.length).toFixed(1) : "0.0";
  const ratedClasses = classRates.filter((c) => c.attendance_pct !== null);
  const avgClassRate = ratedClasses.length
    ? Math.round((ratedClasses.reduce((s, c) => s + (c.attendance_pct ?? 0), 0) / ratedClasses.length) * 10) / 10
    : null;

  // The stat cards describe whichever dataset the user is looking at. On the
  // register view they used to report today's unmarked roster (all zeros) while
  // the table below showed a full month — now they follow the active view.
  const selectedClassObj = classes.find((c) => c.id === selectedClass);
  const isMark = view === "mark";
  const scopeLabel = isMark
    ? (selectedClassObj ? `${selectedClassObj.name} ${selectedClassObj.section ?? ""}`.trim() : "Select class")
    : month;
  const statValues = isMark
    ? {
        primary: students.length,
        secondaryLabel: "Present",
        secondary: presentCount,
        tertiaryLabel: "Absent",
        tertiary: absentCount,
        quaternaryLabel: "Late",
        quaternary: lateCount,
        rateLabel: "Attendance Rate",
        rate: attendanceRate,
        secondaryProgress: students.length > 0 ? (presentCount / students.length) * 100 : 0,
      }
    : {
        primary: regStudents.length,
        secondaryLabel: "Present Days",
        secondary: totalPresent,
        tertiaryLabel: "Absent Days",
        tertiary: totalAbsent,
        quaternaryLabel: "Perfect Days",
        quaternary: perfectDays,
        rateLabel: "Register Rate",
        rate: registerRate,
        secondaryProgress: totalMarks > 0 ? (totalPresent / totalMarks) * 100 : 0,
      };

  // Roll-call tile: who the student is, then one big Present/Absent/Late switch — built to sweep a class of 40 fast.
  const rollCallCards = (
    <CardGrid min="16rem" empty={<CardEmpty title="No students found" hint="Select a class to mark attendance" icon="check" />}>
      {filteredStudents.map((student) => {
        const status = (attendance[student.id] || "Present") as keyof typeof ROLL_TILE;
        const tile = ROLL_TILE[status] ?? ROLL_TILE.Present;
        return (
          <RecordCard key={student.id} rail={tile.tone} className={tile.tint}>
            <CardBody className="gap-3">
              <CardTitle
                lead={<Monogram text={initials(student.fullName || "Student")} tone={toneFor(student.fullName)} shape="circle" />}
                title={student.fullName || "Unknown"}
                subtitle={student.class ? student.class.name : undefined}
                aside={<StatusPill status={status} tone={tile.tone} />}
              />
              <div className="flex flex-wrap gap-1.5">
                <Chip icon="user">Roll {student.rollNo ?? "—"}</Chip>
                <Chip icon="clipboard"><span className="font-mono">{student.admissionNo || "—"}</span></Chip>
              </div>
              <div
                role="group"
                aria-label={`Attendance for ${student.fullName || "student"}`}
                className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1"
              >
                {(["Present", "Absent", "Late"] as const).map((statusOption) => {
                  const isActive = status === statusOption;
                  return (
                    <button
                      key={statusOption}
                      type="button"
                      aria-pressed={isActive}
                      disabled={!canMark} onClick={() => setAttendance({ ...attendance, [student.id]: statusOption })}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-semibold transition-all duration-150 ${
                        isActive ? ROLL_TILE[statusOption].on : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      <Icon name={ROLL_TILE[statusOption].icon} className="h-3.5 w-3.5" />
                      {statusOption}
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  // Monthly heat card: the attendance % ring answers "how is this student doing", the calendar shows when.
  const registerMonth = register?.month ?? month;
  const [regYear, regMon] = registerMonth.split("-").map(Number);
  const daysInMonth = regYear && regMon ? new Date(Date.UTC(regYear, regMon, 0)).getUTCDate() : 0;
  const firstWeekday = regYear && regMon ? new Date(Date.UTC(regYear, regMon - 1, 1)).getUTCDay() : 0;
  const regDateSet = new Set(regDates);
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => `${registerMonth}-${String(i + 1).padStart(2, "0")}`);
  const registerCards = (
    <CardGrid min="17rem" empty={<CardEmpty title="No attendance recorded for this month" hint="Mark daily attendance and the register fills in automatically." icon="calendar" />}>
      {regStudents.map((s) => {
        const pct = s.marked > 0 ? Math.round((s.present / s.marked) * 100) : 0;
        const ringTone: Tone = s.marked === 0 ? "slate" : pct >= 90 ? "ok" : pct >= 75 ? "warn" : "danger";
        const absent = Object.values(s.days).filter((v) => v === "Absent").length;
        const late = Object.values(s.days).filter((v) => v === "Late").length;
        return (
          <RecordCard key={s.id} rail={ringTone}>
            <CardBody>
              <CardTitle
                lead={<Ring value={pct} tone={ringTone} size={52} label={`${s.fullName}: ${pct}% present`} />}
                title={s.fullName}
                subtitle={<span className="tnum">Roll {s.rollNo ?? "—"} · {s.present}/{s.marked} days present</span>}
              />
              <div className="flex flex-wrap gap-1.5">
                <Chip icon="check" tone="ok">{s.present} present</Chip>
                {absent > 0 && <Chip icon="x" tone="danger">{absent} absent</Chip>}
                {late > 0 && <Chip icon="clock" tone="warn">{late} late</Chip>}
              </div>
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="grid grid-cols-7 gap-1" aria-hidden>
                  {WEEKDAYS.map((w, i) => (
                    <span key={i} className="text-center text-[10px] font-semibold uppercase text-ink-3">{w}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1" role="list" aria-label={`${s.fullName} daily attendance`}>
                  {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} aria-hidden />)}
                  {monthDays.map((d) => {
                    const st = s.days[d];
                    const schoolDay = regDateSet.has(d);
                    const label = st ? `${d}: ${st}` : schoolDay ? `${d}: not marked` : `${d}: no register`;
                    return (
                      <span
                        key={d}
                        role="listitem"
                        title={label}
                        aria-label={label}
                        className={`tnum flex h-7 flex-col items-center justify-center rounded-md text-[10.5px] font-semibold leading-none ${
                          st ? HEAT_CELL[st] ?? "bg-surface text-ink-2" : schoolDay ? "bg-surface text-ink-2 ring-1 ring-line" : "text-ink-3/60"
                        }`}
                      >
                        {Number(d.slice(8))}
                        <span
                          className={`mt-0.5 h-1 w-1 rounded-full ${st ? STATUS_TONE[st]?.dot ?? "bg-line-strong" : schoolDay ? "bg-line-strong" : "bg-transparent"}`}
                        />
                      </span>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  return (
    <div className="relative min-h-screen">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-ok/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-brand-700/10 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-line bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <PageHeader
            icon="attendance"
            title="Attendance"
            subtitle="Track student attendance and monitor class participation"
          />
          <div className="flex items-center gap-3">
            <Button variant="soft" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
              <Icon name="refresh" className="h-4 w-4" /> Today
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6">
          {[
            { id: "mark", label: "Mark Attendance", icon: "check"},
            { id: "register", label: "Monthly Register", icon: "calendar"},
            { id: "absentees", label: "Absentees", icon: "x"},
            { id: "low", label: "Low Attendance", icon: "alert"},
            { id: "analytics", label: "Analytics", icon: "trendUp"},
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id as typeof view)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${view === tab.id ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-100" : "text-ink-2 hover:bg-slate-100"}`}
            >
              <Icon name={tab.icon} className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Reveal delay={0}>
            <div className="rounded-xl bg-brand-900 p-5 text-white shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">Total {isMark ? "Students" : "In Register"}</span>
                <Icon name="check" className="h-5 w-5 text-ink-2" />
              </div>
              <p className="text-3xl font-bold">{statValues.primary}</p>
              <p className="text-xs text-ink-3 mt-1">{scopeLabel}</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-xl bg-ok-soft border border-ok-line p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-ok uppercase tracking-wide">{statValues.secondaryLabel}</span>
                <Icon name="check" className="h-5 w-5 text-ok" />
              </div>
              <p className="text-3xl font-bold text-ok-ink">{statValues.secondary}</p>
              <div className="mt-2 h-2 bg-ok-line rounded-full overflow-hidden">
                <div className="h-full bg-ok rounded-full transition-all duration-500" style={{ width: `${statValues.secondaryProgress}%` }} />
              </div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="rounded-xl bg-danger-soft border border-danger-line p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-danger uppercase tracking-wide">{statValues.tertiaryLabel}</span>
                <Icon name="x" className="h-5 w-5 text-danger" />
              </div>
              <p className="text-3xl font-bold text-danger-ink">{statValues.tertiary}</p>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="rounded-xl bg-warn-soft border border-warn-line p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-warn uppercase tracking-wide">{statValues.quaternaryLabel}</span>
                <Icon name="clock" className="h-5 w-5 text-warn" />
              </div>
              <p className="text-3xl font-bold text-warn-ink">{statValues.quaternary}</p>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <div className="rounded-xl bg-surface-2 border border-line p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-ink-2 uppercase tracking-wide">{statValues.rateLabel}</span>
                <span className={`text-lg font-bold ${statValues.rate >= 80 ? "text-ok" : statValues.rate >= 60 ? "text-warn" : "text-danger"}`}>
                  {statValues.rate}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-line rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${statValues.rate >= 80 ? "bg-ok" : statValues.rate >= 60 ? "bg-warn" : "bg-danger"}`} style={{ width: `${statValues.rate}%` }} />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Filter Bar — marking controls only. The register and analytics views
            carry their own class/month pickers, so these are hidden there. */}
        {view === "mark" && (
        <Reveal delay={100}>
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-white border border-line shadow-sm">
            <div className="relative flex-1 min-w-[200px]">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
              <select
                aria-label="Class"
                value={selectedClass}
                onChange={(e) => { setSelectedClass(e.target.value); setDate(new Date().toISOString().split("T")[0]); }}
                className="w-full appearance-none rounded-lg border border-line-strong bg-surface-2 pl-10 pr-10 py-2.5 text-sm text-ink-2 focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""} ({c._count?.students ?? 0} students){c.is_class_teacher ? " · my class" : ""}</option>
                ))}
              </select>
              <Icon name="calendar" className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            </div>
            
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="appearance-none rounded-lg border border-line-strong bg-surface-2 px-4 py-2.5 pr-10 text-sm text-ink-2 focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20"
              />
              <Icon name="calendar" className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Filter by status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="appearance-none rounded-xl border border-line bg-surface-2 px-4 py-2.5 pr-10 text-sm text-ink-2 focus:border-brand-700"
              >
                <option value="">All Status</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Late">Late</option>
            
              </select>
              <Icon name="filter" className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            </div>

            {canMark && <div className="flex items-center gap-2 ml-auto">
              <Button variant="soft" onClick={() => markAll("Present")}>
                <Icon name="check" className="h-4 w-4" /> All Present
              </Button>
              <Button variant="soft" onClick={() => markAll("Absent")}>
                <Icon name="x" className="h-4 w-4" /> All Absent
              </Button>
              <Button variant="primary" onClick={save} loading={saving} className="shadow-lg shadow-brand-700/20">
                <Icon name="check" className="h-4 w-4" /> Save
              </Button>
              <Button variant="danger" onClick={notifyAbsent} loading={notifyLoading} disabled={!absentCount} title="Re-send absence notices that have not gone out yet">
                <Icon name="upload" className="h-4 w-4" /> Re-send notices
              </Button>
            </div>}
          </div>
        </Reveal>
        )}

        {/* Main Content Area */}
        <Reveal delay={200}>
          {view === "mark" && (
            <div className="rounded-xl border border-line bg-white shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <TableView id="t1" cards={rollCallCards}>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/70 text-[11px] font-bold text-ink-2 uppercase tracking-wider">
                      <th className="px-5 py-3.5 whitespace-nowrap">Student</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Roll No</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Admission No</th>
                      <th className="px-5 py-3.5 whitespace-nowrap text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-sm">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student, idx) => {
                        const status = attendance[student.id] || "Present";
                        const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
                        return (
                          <tr
                            key={student.id}
                            className="group transition-colors duration-150 hover:bg-surface-2/70"
                          >
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-soft ${idx % 8 === 0 ? "bg-gradient-to-br from-brand-700 to-accent-600" : idx % 8 === 1 ? "bg-gradient-to-br from-ok to-teal-600" : idx % 8 === 2 ? "bg-gradient-to-br from-accent-500 to-accent-600" : idx % 8 === 3 ? "bg-gradient-to-br from-warn to-warn" : idx % 8 === 4 ? "bg-gradient-to-br from-danger to-danger" : idx % 8 === 5 ? "bg-gradient-to-br from-chart-4 to-brand-700" : idx % 8 === 6 ? "bg-gradient-to-br from-accent-500 to-brand-700" : "bg-gradient-to-br from-slate-600 to-brand-900"}`}>
                                  {(student.fullName || "Student").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <button type="button" onClick={() => setCalendarFor({ id: student.id, name: student.fullName })} className="font-semibold text-ink hover:text-brand-700 hover:underline" title="Open attendance calendar">
                                    {student.fullName || "Unknown"}
                                  </button>
                                  <p className="text-xs text-ink-3">
                                    {student.class ? student.class.name : ""}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-xs text-ink-2 font-medium">
                              {student.rollNo ?? "—"}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-ink-2">
                              <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 font-medium">{student.admissionNo || "—"}</span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap text-center">
                              <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-line/60">
                                {(["Present", "Absent", "Late"] as const).map((statusOption) => {
                                  const cfg = STATUS_CONFIG[statusOption];
                                  const isActive = status === statusOption;
                                  return (
                                    <button
                                      key={statusOption}
                                      disabled={!canMark} onClick={() => setAttendance({ ...attendance, [student.id]: statusOption })}
                                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${isActive ? `${cfg.bg} ${cfg.text} border ${cfg.border} shadow-soft scale-100` : "text-ink-2 hover:text-ink hover:bg-white"}`}
                                    >
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${isActive ? cfg.dot : "bg-line-strong"} mr-1.5`} />
                                      {statusOption}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-12 text-center">
                          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-3">
                            <Icon name="check" className="h-7 w-7 text-ink-3" />
                          </div>
                          <p className="text-sm font-medium text-ink-2">No students found</p>
                          <p className="text-xs text-ink-3 mt-1">Select a class to mark attendance</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </TableView>
              </div>

              {/* Footer */}
              {filteredStudents.length > 0 && (
                <div className="flex items-center justify-between px-6 py-4 bg-surface-2/50 border-t border-line text-sm">
                  <span>
                    <span className="font-semibold text-ink">{markedCount}</span> of {filteredStudents.length} marked
                  </span>
                  <span className="text-ink-2 text-xs">
                    <span className="font-semibold text-ok">{presentCount}</span> Present · <span className="font-semibold text-danger">{absentCount}</span> Absent · <span className="font-semibold text-warn">{lateCount}</span> Late
                  </span>
                </div>
              )}
            </div>
          )}

          {view === "register" && (
            <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-line bg-surface-2/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink">Monthly Attendance Register</h3>
                    <p className="text-xs text-ink-2 mt-0.5">
                      {registerLoading
                        ? "Loading…"
                        : regStudents.length > 0
                          ? `${regStudents.length} students · ${regDates.length} marked days · ${registerRate}% present`
                          : "No records"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Class"
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="appearance-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-700"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                      ))}
                    </select>
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-700"
                    />
                  </div>
                </div>
              </div>

              {regStudents.length === 0 ? (
                <div className="p-10 text-center">
                  <Icon name="calendar" className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-ink-2">
                    {registerLoading ? "Loading register…" : "No attendance recorded for this month"}
                  </p>
                  <p className="text-xs text-ink-3 mt-1">
                    Mark daily attendance and the register fills in automatically.
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <TableView id="t2" cards={registerCards}>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-surface-2 text-ink-2">
                        <th className="sticky left-0 z-10 bg-surface-2 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide min-w-[200px]">
                          Student
                        </th>
                        {regDates.map((d) => (
                          <th key={d} className="px-2 py-3 text-center text-[11px] font-semibold tabular-nums w-9">
                            {d.slice(8)}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">P</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {regStudents.map((s) => {
                        const pct = s.marked > 0 ? Math.round((s.present / s.marked) * 100) : 0;
                        return (
                          <tr key={s.id} className="hover:bg-surface-2/70">
                            <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-ink">
                              <span className="text-ink-3 tabular-nums mr-2">{s.rollNo ?? "—"}</span>
                              <button type="button" onClick={() => setCalendarFor({ id: s.id, name: s.fullName })} className="hover:text-brand-700 hover:underline" title="Open attendance calendar">
                                {s.fullName}
                              </button>
                            </td>
                            {regDates.map((d) => {
                              const st = s.days[d];
                              const tone = st ? STATUS_TONE[st] : undefined;
                              return (
                                <td key={d} className="px-2 py-2.5 text-center">
                                  {tone ? (
                                    <span
                                      className={`inline-block h-2.5 w-2.5 rounded-full ${tone.dot}`}
                                      title={`${d}: ${st}`}
                                      aria-label={`${d}: ${st}`}
                                    />
                                  ) : (
                                    <span className="text-ink-3" aria-label={`${d}: not marked`}>·</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-center font-semibold tabular-nums text-ink">{s.present}</td>
                            <td
                              className={`px-3 py-2.5 text-center font-semibold tabular-nums ${
                                pct >= 85 ? "text-ok-ink" : pct >= 70 ? "text-warn-ink" : "text-danger-ink"
                              }`}
                            >
                              {pct}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </TableView>
                </div>
              )}

              {regStudents.length > 0 && (
                <div className="flex flex-wrap items-center gap-4 px-6 py-4 bg-surface-2/50 border-t border-line text-xs text-ink-2">
                  {Object.entries(STATUS_TONE).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${v.dot}`} /> {k}
                    </span>
                  ))}
                  <span className="ml-auto">
                    <span className="font-semibold text-ok">{totalPresent}</span> present ·{" "}
                    <span className="font-semibold text-danger">{totalAbsent}</span> absent
                  </span>
                </div>
              )}
            </div>
          )}

          {view === "absentees" && (
            <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden" key="absentees" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-line bg-surface-2/50">
                <div>
                  <h3 className="font-semibold text-ink">Absentee report</h3>
                  <p className="text-xs text-ink-2 mt-0.5">{absentees ? `${absentees.total_absent} absent on ${absentees.date}` : "Loading…"}</p>
                </div>
                <Input type="date" aria-label="Report date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
              </div>
              {absentees && absentees.classes.length === 0 ? (
                <EmptyState icon="check" title="No absentees" hint="Nobody was marked absent on this date (or the register has not been taken yet)." />
              ) : (
                <div className="divide-y divide-line">
                  {(absentees?.classes ?? []).map((c) => (
                    <div key={c.class_id} className="p-4">
                      <div className="mb-2 flex items-baseline justify-between">
                        <p className="font-semibold text-ink">{c.class_name}</p>
                        <span className="text-xs text-ink-3 tnum">{c.absentees.length} absent of {c.marked} marked</span>
                      </div>
                      <div className="table-wrap">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
                              <th className="py-1.5 pr-3">Roll</th><th className="py-1.5 pr-3">Student</th><th className="py-1.5 pr-3">Contact</th><th className="py-1.5">Parent notice</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {c.absentees.map((a) => (
                              <tr key={a.record_id}>
                                <td className="py-2 pr-3 tnum text-ink-3">{a.roll_no ?? "—"}</td>
                                <td className="py-2 pr-3">
                                  <button type="button" onClick={() => setCalendarFor({ id: a.student_id, name: a.full_name })} className="font-medium text-ink hover:text-brand-700 hover:underline">{a.full_name}</button>
                                </td>
                                <td className="py-2 pr-3 font-mono text-xs text-ink-2">{a.contact ?? "—"}</td>
                                <td className="py-2"><Badge tone={a.notified ? "emerald" : "amber"}>{a.notified ? "Sent" : "Pending"}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "low" && (
            <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden" key="low" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
              <div className="flex flex-wrap items-end gap-3 p-4 border-b border-line bg-surface-2/50">
                <div className="mr-auto">
                  <h3 className="font-semibold text-ink">Low attendance</h3>
                  <p className="text-xs text-ink-2 mt-0.5">{low ? `${low.students.length} students below ${low.threshold}%` : "Loading…"}</p>
                </div>
                <label className="text-xs text-ink-2">Threshold %
                  <Input type="number" min={0} max={100} aria-label="Threshold percent" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-24 block" />
                </label>
                <label className="text-xs text-ink-2">Class
                  <Select aria-label="Filter by class" value={lowClass} onChange={(e) => setLowClass(e.target.value)} className="w-auto block">
                    <option value="">All my classes</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
                  </Select>
                </label>
                <label className="text-xs text-ink-2">From
                  <Input type="date" aria-label="From date" value={lowFrom} onChange={(e) => setLowFrom(e.target.value)} className="w-auto block" />
                </label>
                <label className="text-xs text-ink-2">To
                  <Input type="date" aria-label="To date" value={lowTo} onChange={(e) => setLowTo(e.target.value)} className="w-auto block" />
                </label>
              </div>
              {low && low.students.length === 0 ? (
                <EmptyState icon="check" title="Nobody below the threshold" hint="Every student in range is at or above the chosen percentage." />
              ) : (
                <div className="table-wrap">
                  <TableView id="t-low">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-2">
                        <th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3 text-right">Attended / Marked</th><th className="px-4 py-3 text-right">Absent</th><th className="px-4 py-3 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {(low?.students ?? []).map((s) => (
                        <tr key={s.student_id} className="hover:bg-surface-2/70">
                          <td className="px-4 py-2.5">
                            <button type="button" onClick={() => setCalendarFor({ id: s.student_id, name: s.full_name })} className="font-medium text-ink hover:text-brand-700 hover:underline">{s.full_name}</button>
                            <span className="ml-2 font-mono text-xs text-ink-3">{s.admission_no}</span>
                          </td>
                          <td className="px-4 py-2.5 text-ink-2">{s.class_name ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right tnum">{s.attended} / {s.marked}</td>
                          <td className="px-4 py-2.5 text-right tnum">{s.absent}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold tnum ${s.percentage >= threshold - 10 ? "text-warn-ink" : "text-danger-ink"}`}>{s.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </TableView>
                </div>
              )}
            </div>
          )}

          {view === "analytics" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-line bg-white shadow-sm p-6">
                <h3 className="font-semibold text-ink mb-4">Attendance Overview</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-ok-soft">
                    <div>
                      <p className="text-sm font-medium text-ink-2">Register Attendance</p>
                      <p className="text-2xl font-bold text-ok-ink">{registerRate}%</p>
                      <p className="text-xs text-ink-3 mt-0.5">{month} · {regStudents.length} students</p>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-ok-soft flex items-center justify-center">
                      <span className="text-lg font-bold text-ok-ink">{totalPresent}/{totalMarks}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-ok-soft text-center">
                      <p className="text-xs text-ok mb-1">Perfect Days</p>
                      <p className="text-lg font-bold text-ok-ink">{perfectDays}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-warn-soft text-center">
                      <p className="text-xs text-warn mb-1">Avg Attendance</p>
                      <p className="text-lg font-bold text-warn-ink">
                        {registerRate}<span className="text-sm">%</span>
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-danger-soft text-center">
                      <p className="text-xs text-danger mb-1">Absent / Student</p>
                      <p className="text-lg font-bold text-danger-ink">{avgAbsentDays}</p>
                    </div>
                  </div>
                  <p className="text-xs text-ink-3">
                    {regStudents.length > 0
                      ? `Computed from ${totalMarks} marked records across ${regDates.length} days in ${month}.`
                      : "No attendance recorded for this month yet."}
                  </p>
                </div>
              </div>
              {canReports && <div className="rounded-xl border border-line bg-white shadow-sm p-6">
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-semibold text-ink">Class-wise Attendance</h3>
                  <span className="text-xs text-ink-3">
                    {avgClassRate !== null ? `School avg ${avgClassRate}%` : "No records"}
                  </span>
                </div>
                <p className="text-xs text-ink-2 mb-4">Present rate per class, all-time records.</p>
                {ratedClasses.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-3">No attendance recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {ratedClasses.map((cls) => (
                      <div key={cls.class_id} className="flex items-center gap-4 p-3 rounded-xl bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate font-medium text-ink">
                              {cls.class_name} {cls.section ?? ""}
                            </p>
                            <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                              {cls.attendance_pct}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                            <div
                              className={`h-full rounded-full ${
                                (cls.attendance_pct ?? 0) >= 85
                                  ? "bg-ok"
                                  : (cls.attendance_pct ?? 0) >= 70
                                    ? "bg-warn"
                                    : "bg-danger"
                              }`}
                              style={{ width: `${cls.attendance_pct ?? 0}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-ink-3">{cls.total_records} records</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>}
            </div>
          )}
        </Reveal>
      </div>

      {calendarFor && (
          <Modal open onClose={() => setCalendarFor(null)} title={`Attendance · ${calendarFor.name}`} subtitle="Per-day status for the month" size="lg">
            <StudentCalendar studentId={calendarFor.id} />
          </Modal>
      )}
    </div>
  );
}
