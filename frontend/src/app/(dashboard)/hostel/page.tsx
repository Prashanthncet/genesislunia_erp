"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHeader, Reveal, Tabs } from "@/components/ui";
import { RoomsPanel } from "@/components/hostel/RoomsPanel";
import { RollCallPanel } from "@/components/hostel/RollCallPanel";
import { VisitorsPanel } from "@/components/hostel/VisitorsPanel";

/** Mirrors the backend HOSTEL_READ group (front desk + leadership). */
const HOSTEL_READ = [...new Set([...R.HOSTEL_DESK, ...R.LEADERSHIP])];
type Tab = "rooms" | "rollcall" | "visitors";

type MyRoom = {
  student_id: string; student_name: string; hostel: string | null; room: string | null; bed: string | null;
  warden: { name: string; phone: string | null } | null;
  recent_roll_calls: { date: string; session: string; status: string }[];
};

function MyHostel() {
  const [rows, setRows] = useState<MyRoom[] | null>(null);
  useEffect(() => { apiFetch<MyRoom[]>("/api/hostel/my").then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <p className="text-sm text-ink-3">Loading…</p>;
  if (!rows.length) return <EmptyState title="No linked students" icon="hostel" />;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {rows.map((r) => (
        <Card key={r.student_id} className="p-4">
          <p className="font-display text-lg font-bold text-ink">{r.student_name}</p>
          {r.room ? (
            <>
              <p className="mt-1 text-sm text-ink-2">{r.hostel} · Room <b>{r.room}</b> · Bed <b>{r.bed ?? "—"}</b></p>
              {r.warden && <p className="text-xs text-ink-3">Warden: {r.warden.name}{r.warden.phone ? ` · ${r.warden.phone}` : ""}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.recent_roll_calls.map((c) => (
                  <Badge key={`${c.date}-${c.session}`} tone={c.status === "Present" ? "emerald" : c.status === "Absent" ? "rose" : "amber"}>
                    {c.date.slice(5)} {c.session}: {c.status}
                  </Badge>
                ))}
                {r.recent_roll_calls.length === 0 && <span className="text-xs text-ink-3">No roll-calls recorded yet.</span>}
              </div>
            </>
          ) : <p className="mt-1 text-sm text-ink-3">Not a hostel boarder.</p>}
        </Card>
      ))}
    </div>
  );
}

export default function HostelPage() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab>("rooms");

  if (loading) return <p className="text-sm text-ink-3">Loading…</p>;

  if (isPortal(me)) {
    return (
      <div className="space-y-6">
        <Reveal><PageHeader icon="hostel" title="Hostel" subtitle="Room, bed and recent roll-call." /></Reveal>
        <MyHostel />
      </div>
    );
  }

  if (!hasRole(me, HOSTEL_READ)) {
    return (
      <div className="space-y-6">
        <PageHeader icon="hostel" title="Hostel" />
        <EmptyState title="You don't have access to this page" hint="Hostel records are limited to wardens, the front desk and school leadership." icon="hostel" />
      </div>
    );
  }

  const canAdmin = hasRole(me, R.HOSTEL_ADMIN);
  const canDesk = hasRole(me, R.HOSTEL_DESK);

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="hostel"
          title="Hostel"
          subtitle="Rooms and beds, allocation, roll-call and the visitor log."
          actions={<Tabs tabs={[{ id: "rooms", label: "Rooms & beds" }, { id: "rollcall", label: "Roll-call" }, { id: "visitors", label: "Visitors" }] as const} value={tab} onChange={setTab} />}
        />
      </Reveal>
      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "rooms" && <RoomsPanel canAdmin={canAdmin} />}
        {tab === "rollcall" && <RollCallPanel canMark={canAdmin} />}
        {tab === "visitors" && <VisitorsPanel canDesk={canDesk} />}
      </div>
    </div>
  );
}
