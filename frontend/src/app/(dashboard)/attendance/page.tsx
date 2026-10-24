"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { EmptyState, Modal, PageHeader, Select, Tabs, useToast } from "@/components/ui";
import { R, ROLE, hasRole, isPortal, useMe } from "@/lib/auth";
import { StudentCalendar } from "@/components/attendance/StudentCalendar";
import { MarkAttendance } from "@/components/attendance/MarkAttendance";
import { MonthlyRegister } from "@/components/attendance/MonthlyRegister";
import { AbsenteesView } from "@/components/attendance/AbsenteesView";
import { AnalyticsView, LowAttendanceView } from "@/components/attendance/AttendanceInsights";
import { ATTENDANCE_READ } from "@/components/attendance/status";
import type { ClassOpt } from "@/components/attendance/ClassSectionSelect";

export default function AttendancePage() {
  const { me, loading } = useMe();
  if (loading) return <div className="p-6 text-sm text-ink-3">Loading…</div>;
  if (isPortal(me)) return <PortalAttendance />;
  if (!hasRole(me, ATTENDANCE_READ)) {
    return (
      <div className="p-6">
        <EmptyState icon="lock" title="You don't have access to this page" hint="Class attendance is available to teaching staff, leadership and the office." />
      </div>
    );
  }
  return <StaffAttendance />;
}

/** Parent / student who lands here: their own calendar (the portal page has the full view). */
function PortalAttendance() {
  const { me } = useMe();
  const kids = me?.role === ROLE.STUDENT && me.student
    ? [{ id: me.student.id, name: me.student.fullName }]
    : (me?.children ?? []).map((c) => ({ id: c.id, name: c.fullName }));
  const [sel, setSel] = useState("");
  const current = sel || kids[0]?.id || "";
  return (
    <div className="space-y-5">
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
          {current && <div className="card p-4 sm:p-5"><StudentCalendar studentId={current} /></div>}
        </div>
      )}
    </div>
  );
}

type View = "mark" | "register" | "absentees" | "low" | "analytics";

function StaffAttendance() {
  const { me } = useMe();
  const canMark = hasRole(me, R.ATTENDANCE_MARK);
  const toast = useToast();
  const [view, setView] = useState<View>("mark");
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [calendarFor, setCalendarFor] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid|cannot|could not|forbidden|only/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);
  const onMessage = useCallback((m: string) => setMessage(m), []);

  useEffect(() => {
    apiFetch<ClassOpt[]>("/api/attendance/my-classes")
      .then((d) => setClasses(Array.isArray(d) ? d : []))
      .catch((e) => { setClasses([]); setMessage(e instanceof Error ? e.message : "Failed to load classes"); });
  }, []);

  const tabs = [
    { id: "mark" as const, label: canMark ? "Mark attendance" : "Day sheet" },
    { id: "register" as const, label: "Monthly register" },
    { id: "absentees" as const, label: "Absentees" },
    { id: "low" as const, label: "Low attendance" },
    { id: "analytics" as const, label: "Analytics" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon="attendance"
        title="Attendance"
        subtitle="Mark the daily roll call, review the monthly register, follow up absentees and watch the trend."
      />
      <div className="overflow-x-auto">
        <Tabs tabs={tabs} value={view} onChange={setView} />
      </div>

      {classes === null ? (
        <p className="text-sm text-ink-3">Loading classes…</p>
      ) : classes.length === 0 ? (
        <div className="card"><EmptyState icon="layers" title="No classes to show" hint="You are not the class teacher of, or timetabled in, any class yet." /></div>
      ) : (
        <div key={view} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          {view === "mark" && <MarkAttendance classes={classes} canMark={canMark} onMessage={onMessage} onOpenStudent={setCalendarFor} />}
          {view === "register" && <MonthlyRegister classes={classes} onMessage={onMessage} onOpenStudent={setCalendarFor} />}
          {view === "absentees" && <AbsenteesView classes={classes} canMark={canMark} onMessage={onMessage} onOpenStudent={setCalendarFor} />}
          {view === "low" && <LowAttendanceView classes={classes} onMessage={onMessage} onOpenStudent={setCalendarFor} />}
          {view === "analytics" && <AnalyticsView classes={classes} onMessage={onMessage} />}
        </div>
      )}

      {calendarFor && (
        <Modal open onClose={() => setCalendarFor(null)} title={`Attendance · ${calendarFor.name}`} subtitle="Per-day status for the month" size="lg">
          <StudentCalendar studentId={calendarFor.id} />
        </Modal>
      )}
    </div>
  );
}
