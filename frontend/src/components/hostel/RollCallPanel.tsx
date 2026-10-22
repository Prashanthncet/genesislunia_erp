"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Input, Select, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { classLabel, type Hostel, type RosterRow } from "./types";

const STATUSES = ["Present", "Absent", "On Leave"] as const;
const tone = (s: string) => (s === "Present" ? "emerald" : s === "Absent" ? "rose" : "amber") as "emerald" | "rose" | "amber";
const today = () => new Date().toISOString().slice(0, 10);
const weekAgo = () => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);

type Report = {
  summary: { date: string; session: string; hostel_id: string; Present: number; Absent: number; "On Leave": number }[];
  rows: { id: string; date: string; session: string; status: string; student: { fullName: string; admissionNo: string } }[];
};

export function RollCallPanel({ canMark }: { canMark: boolean }) {
  const toast = useToast();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [hostelId, setHostelId] = useState("");
  const [date, setDate] = useState(today());
  const [session, setSession] = useState<"Morning" | "Night">(new Date().getHours() >= 15 ? "Night" : "Morning");
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [marked, setMarked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    apiFetch<Hostel[]>("/api/hostel")
      .then((h) => { setHostels(h); if (h[0]) setHostelId(h[0].id); })
      .catch((e) => toast.push(e instanceof Error ? e.message : "Failed", "error"));
  }, [toast]);

  const load = useCallback(async () => {
    if (!hostelId) return;
    setLoading(true);
    try {
      const [r, rep] = await Promise.all([
        apiFetch<{ roster: RosterRow[]; already_marked: boolean }>(`/api/hostel/roll-call?hostel_id=${hostelId}&date=${date}&session=${session}`),
        apiFetch<Report>(`/api/hostel/roll-call/report?hostel_id=${hostelId}&from=${weekAgo()}&to=${today()}`),
      ]);
      setRoster(r.roster);
      setMarked(r.already_marked);
      setReport(rep);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setLoading(false);
    }
  }, [hostelId, date, session, toast]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = (id: string, status: RosterRow["status"]) =>
    setRoster((rs) => rs.map((r) => (r.student_id === id ? { ...r, status } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<{ saved: number; parents_notified: number }>("/api/hostel/roll-call", {
        method: "POST",
        body: JSON.stringify({ hostel_id: hostelId, date, session, entries: roster.map((r) => ({ student_id: r.student_id, status: r.status })) }),
      });
      toast.push(`Roll-call saved for ${res.saved} students${res.parents_notified ? ` · ${res.parents_notified} parent(s) notified` : ""}`, "success");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const counts = STATUSES.map((s) => [s, roster.filter((r) => r.status === s).length] as const);
  const absentees = report?.rows.filter((r) => r.status === "Absent") ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardHead
          title="Roll-call"
          icon="attendance"
          subtitle="Approved leaves and checked-out gate passes are pre-filled On Leave. Night absences SMS the parent."
          actions={
            <div className="flex flex-wrap gap-2">
              <Select aria-label="Hostel" className="field w-auto" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
                {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
              <Input type="date" aria-label="Date" className="field w-auto" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
              <Select aria-label="Session" className="field w-auto" value={session} onChange={(e) => setSession(e.target.value as "Morning" | "Night")}>
                <option>Morning</option>
                <option>Night</option>
              </Select>
            </div>
          }
        />
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {counts.map(([s, n]) => <Badge key={s} tone={tone(s)}>{s}: {n}</Badge>)}
          <Badge tone={marked ? "brand" : "slate"}>{marked ? "Already marked — saving updates it" : "Not marked yet"}</Badge>
          {canMark && roster.length > 0 && (
            <>
              <Button size="sm" onClick={() => setRoster((rs) => rs.map((r) => (r.leave_reason ? r : { ...r, status: "Present" })))}>All present</Button>
              <Button size="sm" variant="primary" loading={saving} onClick={save}>Save roll-call</Button>
            </>
          )}
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-ink-3">Loading…</p>
        ) : roster.length === 0 ? (
          <EmptyState title="Nobody is allocated to this hostel" icon="hostel" />
        ) : (
          <TableView id="hostel-roster">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-3 py-2 text-left">Student</th><th className="px-3 py-2 text-left">Room / bed</th><th className="px-3 py-2 text-left">Note</th><th className="px-3 py-2 text-left">Status</th></tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.student_id} className="border-t border-line">
                    <td className="px-3 py-2"><span className="font-semibold">{r.student.fullName}</span> <span className="text-xs text-ink-3">{r.student.admissionNo} {classLabel(r.student)}</span></td>
                    <td className="px-3 py-2 tnum">{r.room} / {r.bed ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-ink-3">{r.leave_reason ?? (r.saved ? "saved" : "")}</td>
                    <td className="px-3 py-2">
                      {canMark ? (
                        <Select aria-label={`Status for ${r.student.fullName}`} className="field w-auto" value={r.status} onChange={(e) => setStatus(r.student_id, e.target.value as RosterRow["status"])}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </Select>
                      ) : <Badge tone={tone(r.status)}>{r.status}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        )}
      </Card>

      <Card className="p-4">
        <CardHead title="Last 7 days" icon="reports" subtitle={`${absentees.length} absence(s) recorded`} />
        {report && report.summary.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ul className="space-y-1 text-sm">
              {report.summary.map((s) => (
                <li key={`${s.date}-${s.session}`} className="flex items-center justify-between rounded-lg bg-surface-2/70 px-3 py-1.5">
                  <span className="tnum">{s.date} · {s.session}</span>
                  <span className="flex gap-1"><Badge tone="emerald">{s.Present}</Badge><Badge tone="rose">{s.Absent}</Badge><Badge tone="amber">{s["On Leave"]}</Badge></span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1 text-sm">
              {absentees.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg bg-danger-soft/40 px-3 py-1.5">
                  <span>{a.student.fullName} <span className="text-xs text-ink-3">{a.student.admissionNo}</span></span>
                  <span className="tnum text-xs">{a.date} · {a.session}</span>
                </li>
              ))}
              {absentees.length === 0 && <li className="text-ink-3">No absences.</li>}
            </ul>
          </div>
        ) : <p className="text-sm text-ink-3">No roll-calls recorded in the last 7 days.</p>}
      </Card>
    </div>
  );
}
