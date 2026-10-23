"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import { EmptyState, PageHeader, Reveal, Skeleton, Tabs } from "@/components/ui";
import { LeaveApprovalPanel, MyLeavePanel } from "@/components/leaves/StaffLeavePanel";
import { StudentLeavePanel } from "@/components/leaves/StudentLeavePanel";
import { GatePassPanel } from "@/components/leaves/GatePassPanel";
import { SecurityDesk } from "@/components/leaves/SecurityDesk";
import { GATE_READ, GATE_REQUEST, STUDENT_LEAVE_FILE, STUDENT_LEAVE_READ, type StudentOption } from "@/components/leaves/shared";

type Tab = "mine" | "approvals" | "student" | "gate" | "desk";

/**
 * Leave & gate pass — staff only. Parents request leave / see passes from the parent portal,
 * which calls the same endpoints (the backend scopes them to their own children).
 */
export default function LeavesPage() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab>("mine");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [tick, setTick] = useState(0);

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [];
    if (!me) return t;
    if (hasRole(me, R.STAFF)) t.push({ id: "mine", label: "My leave" });
    if (hasRole(me, R.LEAVE_APPROVE)) t.push({ id: "approvals", label: "Approvals" });
    if (hasRole(me, STUDENT_LEAVE_READ)) t.push({ id: "student", label: "Student leave" });
    if (hasRole(me, GATE_READ)) t.push({ id: "gate", label: "Gate passes" });
    if (hasRole(me, R.GATE_DESK)) t.push({ id: "desk", label: "Security desk" });
    return t;
  }, [me]);

  // Security staff land on the desk; everyone else on their own leave.
  useEffect(() => {
    if (me && me.role === "security") setTab("desk");
  }, [me]);

  const needStudents = !!me && (hasRole(me, STUDENT_LEAVE_FILE) || hasRole(me, GATE_REQUEST));
  useEffect(() => {
    if (!needStudents || !hasRole(me, R.STUDENT_READ)) return;
    apiFetch<{ data: StudentOption[] }>("/api/students?page_size=200")
      .then((r) => setStudents(r.data ?? []))
      .catch(() => undefined);
  }, [needStudents, me]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (!me || isPortal(me) || !hasRole(me, R.STAFF)) {
    return (
      <div className="card">
        <EmptyState
          title="You don't have access to this page"
          hint="Leave requests and gate passes for your child are in the parent portal."
          icon="lock"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="leaves"
          title="Leaves & Gate Passes"
          subtitle="Apply for leave, decide requests in your queue, and run the gate-pass workflow with parent one-time codes."
        />
      </Reveal>

      {tabs.length > 1 && (
        <Reveal delay={40}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </Reveal>
      )}

      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "mine" && <MyLeavePanel me={me} onChanged={() => setTick((t) => t + 1)} />}
        {tab === "approvals" && <LeaveApprovalPanel me={me} refreshKey={tick} onChanged={() => setTick((t) => t + 1)} />}
        {tab === "student" && <StudentLeavePanel me={me} students={students} />}
        {tab === "gate" && <GatePassPanel me={me} students={students} refreshKey={tick} />}
        {tab === "desk" && <SecurityDesk onChanged={() => setTick((t) => t + 1)} />}
      </div>
    </div>
  );
}
