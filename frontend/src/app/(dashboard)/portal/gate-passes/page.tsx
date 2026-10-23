"use client";

import { Card, CardHead, EmptyState, Icon, PageHeader } from "@/components/ui";
import { PortalPage, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState, StatusBadge, fmtWhen } from "@/components/portal/bits";
import type { PortalLeaves } from "@/components/portal/types";

function GatePassBody({ child }: { child: PortalChild }) {
  const { data, error, loading, reload } = useChildData<PortalLeaves>(child.id, "leaves");
  return (
    <Card>
      <CardHead icon="door" title="Gate passes" subtitle={`Every time ${child.full_name} left campus on a pass`} />
      <PanelState loading={loading} error={error} reload={reload} />
      {data && data.gate_passes.length === 0 && <EmptyState icon="door" title="No gate passes yet" />}
      {data && data.gate_passes.length > 0 && (
        <ul className="divide-y divide-line">
          {data.gate_passes.map((g) => (
            <li key={g.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink">{g.type}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{g.reason}</p>
                </div>
                <StatusBadge status={g.status} />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
                <div><dt className="text-ink-3">Planned out</dt><dd className="tnum text-ink">{fmtWhen(g.out_time)}</dd></div>
                <div><dt className="text-ink-3">Expected back</dt><dd className="tnum text-ink">{fmtWhen(g.expected_in_time)}</dd></div>
                <div><dt className="text-ink-3">Left</dt><dd className="tnum text-ink">{fmtWhen(g.actual_out_time)}</dd></div>
                <div><dt className="text-ink-3">Returned</dt><dd className="tnum text-ink">{fmtWhen(g.actual_in_time)}</dd></div>
              </dl>
              {g.rejected_reason && <p className="mt-1.5 text-[12px] text-danger">Rejected: {g.rejected_reason}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="mx-4 mb-4 mt-1 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-ink-2 sm:mx-5">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
        The one-time code for checkout is sent to your phone by SMS and is never shown on this screen.
      </p>
    </Card>
  );
}

export default function PortalGatePassesPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="door" title="Gate passes" subtitle="Requests to leave campus and when your child went out and came back." />
      <PortalPage>{(child) => <GatePassBody key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
