"use client";

import { useEffect, useMemo, useState } from "react";
import { hasRole, R, useMe } from "@/lib/auth";
import { EmptyState, PageHeader, Reveal, Tabs } from "@/components/ui";
import { DirectoryPanel } from "@/components/staff/DirectoryPanel";
import { PayrollPanel } from "@/components/staff/PayrollPanel";
import { MyPayslipsPanel } from "@/components/staff/MyPayslipsPanel";

type Tab = "directory" | "payroll" | "mine";

export default function StaffPage() {
  const { me, loading } = useMe();
  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [];
    if (hasRole(me, R.STAFF_DIRECTORY)) t.push({ id: "directory", label: "Directory" });
    if (hasRole(me, R.PAYROLL)) t.push({ id: "payroll", label: "Payroll" });
    if (hasRole(me, R.STAFF)) t.push({ id: "mine", label: "My payslips" });
    return t;
  }, [me]);
  const [tab, setTab] = useState<Tab>("mine");
  useEffect(() => { if (tabs.length && !tabs.some((t) => t.id === tab)) setTab(tabs[0].id); }, [tabs, tab]);

  if (loading) return <p className="text-sm text-ink-3">Loading…</p>;
  if (!tabs.length) {
    return (
      <div className="space-y-6">
        <PageHeader icon="staff" title="Staff & Payroll" />
        <EmptyState title="You don't have access to this page" icon="staff" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="staff"
          title="Staff & Payroll"
          subtitle="Directory, profiles and logins, payroll runs and payslips."
          actions={tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
        />
      </Reveal>
      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "directory" && <DirectoryPanel />}
        {tab === "payroll" && <PayrollPanel />}
        {tab === "mine" && <MyPayslipsPanel />}
      </div>
    </div>
  );
}
