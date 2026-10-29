"use client";

import { useEffect, useState } from "react";
import { hasRole, R, ROLE, useMe } from "@/lib/auth";
import { EmptyState, PageHeader, Reveal, Tabs } from "@/components/ui";
import { BankPanel, GradingPanel, ResultsPanel, TestsPanel } from "@/components/cbt/AuthorPanels";
import { MyResultsPanel, MyTestsPanel } from "@/components/cbt/StudentPanels";

type AuthorTab = "bank" | "tests" | "grading" | "results";

export default function CbtPage() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<AuthorTab>("tests");
  const [resultsFor, setResultsFor] = useState<string | undefined>();
  useEffect(() => { if (resultsFor) setTab("results"); }, [resultsFor]);

  if (loading) return <p className="text-sm text-ink-3">Loading…</p>;

  if (hasRole(me, [ROLE.STUDENT])) {
    return (
      <div className="space-y-6">
        <Reveal><PageHeader icon="cbt" title="Online Tests" subtitle="Timed tests for your class. Your answers save automatically." /></Reveal>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MyTestsPanel />
          <MyResultsPanel />
        </div>
      </div>
    );
  }

  if (!hasRole(me, R.CBT_AUTHOR)) {
    return (
      <div className="space-y-6">
        <PageHeader icon="cbt" title="Computer-Based Tests" />
        <EmptyState title="You don't have access to this page" hint="Tests are authored by teachers and taken by students." icon="cbt" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="cbt"
          title="Computer-Based Tests"
          subtitle="Question bank, timed tests, grading queue and results."
          actions={
            <Tabs
              tabs={[{ id: "bank", label: "Question bank" }, { id: "tests", label: "Tests" }, { id: "grading", label: "Grading" }, { id: "results", label: "Results" }] as const}
              value={tab}
              onChange={(t) => { setTab(t); if (t !== "results") setResultsFor(undefined); }}
            />
          }
        />
      </Reveal>
      <div key={`${tab}-${resultsFor ?? ""}`} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "bank" && <BankPanel />}
        {tab === "tests" && <TestsPanel onResults={setResultsFor} />}
        {tab === "grading" && <GradingPanel />}
        {tab === "results" && <ResultsPanel initialTest={resultsFor} />}
      </div>
    </div>
  );
}
