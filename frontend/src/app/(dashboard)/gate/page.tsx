"use client";

import { useEffect, useMemo, useState } from "react";
import { hasRole, R, ROLE, useMe } from "@/lib/auth";
import { EmptyState, PageHeader, Reveal, Skeleton, Tabs } from "@/components/ui";
import { GatePassPanel } from "@/components/leaves/GatePassPanel";
import { SecurityDesk } from "@/components/leaves/SecurityDesk";
import { VisitorsPanel } from "@/components/hostel/VisitorsPanel";
import { IssuePassPanel } from "@/components/gate/IssuePassPanel";
import { PassRecordsPanel } from "@/components/gate/PassRecordsPanel";
import { GATE_TAB_ROLES } from "@/components/gate/types";

type Tab = keyof typeof GATE_TAB_ROLES;

const LABELS: Record<Tab, string> = {
  issue: "Issue pass",
  approvals: "Approvals",
  desk: "Verify & exit / return",
  records: "Pass records",
  visitors: "Visitors",
};

/**
 * Gate Desk — everything that happens at the school gate in one place:
 * issue a pass (warden), approve (warden → principal), verify the parent's code and
 * check students out/in (warden + security), the full pass register, and the visitor log.
 * Leave requests stay on /leaves.
 */
export default function GateDeskPage() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab | null>(null);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const tabs = useMemo(
    () => (Object.keys(GATE_TAB_ROLES) as Tab[])
      .filter((t) => hasRole(me, GATE_TAB_ROLES[t]))
      .map((id) => ({ id, label: LABELS[id] })),
    [me],
  );

  // Land each role on the tab it uses most.
  useEffect(() => {
    if (!me || tab) return;
    const preferred: Tab = me.role === ROLE.SECURITY ? "desk" : me.role === ROLE.WARDEN ? "issue" : "approvals";
    setTab(tabs.some((t) => t.id === preferred) ? preferred : tabs[0]?.id ?? null);
  }, [me, tab, tabs]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (!me || !hasRole(me, R.GATE_DESK)) {
    return (
      <div className="card">
        <EmptyState icon="lock" title="You don't have access to this page" hint="The Gate Desk is for the warden, security and school leadership." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="door"
          title="Gate Desk"
          subtitle="Issue gate passes, verify the parent's one-time code at the gate, check students out and back in, and keep the pass register and visitor log."
        />
      </Reveal>

      {tabs.length > 1 && (
        <Reveal delay={40}>
          <Tabs tabs={tabs} value={tab ?? tabs[0].id} onChange={setTab} />
        </Reveal>
      )}

      <div key={tab ?? "none"} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "issue" && <IssuePassPanel me={me} onIssued={bump} />}
        {tab === "approvals" && <GatePassPanel me={me} students={[]} refreshKey={tick} showRequest={false} onChanged={bump} />}
        {tab === "desk" && <SecurityDesk onChanged={bump} />}
        {tab === "records" && <PassRecordsPanel me={me} refreshKey={tick} />}
        {tab === "visitors" && <VisitorsPanel canDesk={hasRole(me, R.HOSTEL_DESK)} />}
      </div>
    </div>
  );
}
