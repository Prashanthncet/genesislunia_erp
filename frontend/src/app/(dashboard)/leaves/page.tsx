"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import { EmptyState, Icon, PageHeader, Reveal, Skeleton, Tabs } from "@/components/ui";
import { LeaveApprovalPanel, MyLeavePanel } from "@/components/leaves/StaffLeavePanel";
import { StudentLeavePanel } from "@/components/leaves/StudentLeavePanel";
import { STUDENT_LEAVE_FILE, STUDENT_LEAVE_READ, type StudentOption } from "@/components/leaves/shared";

type Tab = "mine" | "approvals" | "student";
const TABS: Tab[] = ["mine", "approvals", "student"];

/**
 * Leaves — staff only: your own leave, the staff requests waiting on you, and student leave
 * (the only screen that files and decides it; the student profile links here).
 *
 * Gate passes are NOT here: everyone who can issue, approve, verify or audit a pass does it
 * on the Gate Desk (/gate), so this screen only points there.
 */
function LeavesContent() {
  const { me, loading } = useMe();
  const searchParams = useSearchParams();
  const queryTab = searchParams.get("tab") as Tab | null;

  const [tab, setTab] = useState<Tab>(() => {
    if (queryTab && TABS.includes(queryTab)) {
      return queryTab;
    }
    return "mine";
  });

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [tick, setTick] = useState(0);

  // Sync tab state when URL search params change
  useEffect(() => {
    if (queryTab && TABS.includes(queryTab)) {
      setTab(queryTab);
    }
  }, [queryTab]);

  // Smooth-scroll to target section if hash or query is present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash) {
        const el = document.querySelector(hash);
        if (el) {
          setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        }
      }
    }
  }, [tab]);

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [];
    if (!me) return t;
    if (hasRole(me, R.STAFF)) t.push({ id: "mine", label: "My leave" });
    if (hasRole(me, R.LEAVE_APPROVE)) t.push({ id: "approvals", label: "Approvals" });
    if (hasRole(me, STUDENT_LEAVE_READ)) t.push({ id: "student", label: "Student leave" });
    return t;
  }, [me]);

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nextTab);
      url.hash = "";
      window.history.replaceState(null, "", url.toString());
    }
  };

  const gateDesk = hasRole(me, R.GATE_DESK);
  const needStudents = !!me && hasRole(me, STUDENT_LEAVE_FILE);
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
          title="Leaves"
          subtitle={gateDesk
            ? "Apply for leave, decide the leave requests in your queue and track student leave."
            : "Apply for leave, decide the requests in your queue and track student leave."}
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
          <Tabs tabs={tabs} value={tab} onChange={handleTabChange} />
        </Reveal>
      )}

      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "mine" && <MyLeavePanel me={me} onChanged={() => setTick((t) => t + 1)} />}
        {tab === "approvals" && <LeaveApprovalPanel me={me} refreshKey={tick} onChanged={() => setTick((t) => t + 1)} />}
        {tab === "student" && <StudentLeavePanel me={me} students={students} />}
      </div>
    </div>
  );
}

export default function LeavesPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64 w-full" /></div>}>
      <LeavesContent />
    </Suspense>
  );
}
