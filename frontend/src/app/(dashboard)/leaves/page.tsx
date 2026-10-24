"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import { EmptyState, Icon, PageHeader, Reveal, Skeleton, Tabs } from "@/components/ui";
import { LeaveApprovalPanel, MyLeavePanel } from "@/components/leaves/StaffLeavePanel";
import { StudentLeavePanel } from "@/components/leaves/StudentLeavePanel";
import { GatePassPanel } from "@/components/leaves/GatePassPanel";
import { GATE_READ, GATE_REQUEST, STUDENT_LEAVE_FILE, STUDENT_LEAVE_READ, type StudentOption } from "@/components/leaves/shared";

type Tab = "mine" | "approvals" | "student" | "gate";

/**
 * Leaves — staff only. Parents request leave / see passes from the parent portal, which calls
 * the same endpoints (the backend scopes them to their own children).
 *
 * Gate passes: everyone with the Gate Desk (warden, security, leadership) issues, approves,
 * verifies and audits passes on /gate, so this screen only keeps the "Gate passes" tab for
 * teaching staff (teacher/HOD) who request and track passes but have no Gate Desk.
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
    if (hasRole(me, GATE_READ) && !hasRole(me, R.GATE_DESK)) t.push({ id: "gate", label: "Gate passes" });
    return t;
  }, [me]);

  const gateDesk = hasRole(me, R.GATE_DESK);
  const needStudents = !!me && (hasRole(me, STUDENT_LEAVE_FILE) || (hasRole(me, GATE_REQUEST) && !gateDesk));
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
          title={gateDesk ? "Leaves" : "Leaves & Gate Passes"}
          subtitle={gateDesk
            ? "Apply for leave and decide the leave requests in your queue."
            : "Apply for leave, decide requests in your queue, and request gate passes for students."}
        />
      </Reveal>

      {gateDesk && (
        <Reveal delay={20}>
          <Link
            href="/gate"
            className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-[13px] text-ink-2 transition-colors hover:bg-brand-50"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-white"><Icon name="door" className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Gate passes are on the Gate Desk</span>
              <span className="block text-[12px] text-ink-3">Issue and approve passes, verify exit codes, check students in and see every pass record.</span>
            </span>
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-3" />
          </Link>
        </Reveal>
      )}

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
      </div>
    </div>
  );
}
