"use client";

/**
 * Hostel roll call: one row per allocated bed — Room | Bed | Student | Status | Last marked.
 * Segmented status control (Present / Absent / On Leave), live counters that double as a
 * status filter, a room filter, "Mark all present" (students on approved leave / out on a
 * gate pass keep On Leave), and a sticky save bar with the summary.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, CardHead, EmptyState, Icon, Input, Select, SkeletonRows, useToast } from "@/components/ui";
import { CardEmpty, Monogram, initials, toneFor } from "@/components/RecordCard";
import { TableView } from "@/components/TableView";
import { MAvatar, MCard, MLabel, MPanel } from "@/components/mobile/MobileCard";
import { MobileFilters } from "@/components/mobile/MobileFilters";
import { confirmAction } from "@/components/confirm";
import { classLabel, type Hostel, type RosterRow } from "./types";

const STATUSES = ["Present", "Absent", "On Leave"] as const;
type RcStatus = (typeof STATUSES)[number];
/** Phone segmented control: selected = solid status colour, idle keeps its own tint. */
const MOBILE_SEG: Record<RcStatus, { on: string; off: string; icon: string }> = {
  Present: { on: "border-transparent bg-ok text-white", off: "border-line bg-surface text-ink-2", icon: "check" },
  Absent: { on: "border-transparent bg-danger text-white", off: "border-line bg-surface text-ink-2", icon: "minus" },
  "On Leave": { on: "border-transparent bg-warn text-white", off: "border-warn-line bg-warn-soft text-warn-ink", icon: "clock" },
};
/** Same palette as class attendance: Present ok, Absent danger, On Leave neutral. */
const STYLE: Record<RcStatus, { on: string; cell: string; dot: string; badge: "emerald" | "rose" | "slate"; short: string }> = {
  Present: { on: "bg-ok text-white", cell: "bg-ok-soft text-ok-ink ring-ok-line", dot: "bg-ok", badge: "emerald", short: "P" },
  Absent: { on: "bg-danger text-white", cell: "bg-danger-soft text-danger-ink ring-danger-line", dot: "bg-danger", badge: "rose", short: "A" },
  "On Leave": { on: "bg-ink-2 text-white", cell: "bg-surface-2 text-ink-2 ring-line-strong", dot: "bg-ink-3", badge: "slate", short: "Leave" },
};
const localDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Report = {
  summary: { date: string; session: string; hostel_id: string; Present: number; Absent: number; "On Leave": number }[];
  rows: { id: string; date: string; session: string; status: string; student: { fullName: string; admissionNo: string } }[];
};

export function RollCallPanel({ canMark }: { canMark: boolean }) {
  const toast = useToast();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [hostelId, setHostelId] = useState("");
  const [date, setDate] = useState(() => localDate());
  const [session, setSession] = useState<"Morning" | "Night">(new Date().getHours() >= 15 ? "Night" : "Morning");
  const [roster, setRoster] = useState<RosterRow[]>([]);
  /** status as saved on the server when the roster was loaded (null = not marked this session) */
  const [savedStatus, setSavedStatus] = useState<Record<string, RcStatus | null>>({});
  const [marked, setMarked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [roomFilter, setRoomFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | RcStatus>("");

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
        apiFetch<Report>(`/api/hostel/roll-call/report?hostel_id=${hostelId}&from=${localDate(-6)}&to=${localDate()}`),
      ]);
      setRoster(r.roster);
      setSavedStatus(Object.fromEntries(r.roster.map((x) => [x.student_id, x.saved ? x.status : null])));
      setMarked(r.already_marked);
      setReport(rep);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setLoading(false);
    }
  }, [hostelId, date, session, toast]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = (id: string, status: RcStatus) =>
    setRoster((rs) => rs.map((r) => (r.student_id === id ? { ...r, status } : r)));
  const markAllPresent = () => setRoster((rs) => rs.map((r) => (r.leave_reason ? r : { ...r, status: "Present" })));

  const save = async () => {
    if (marked) {
      const name = hostels.find((h) => h.id === hostelId)?.name ?? "this hostel";
      const diff = roster.filter((r) => savedStatus[r.student_id] !== r.status).length;
      if (!(await confirmAction({
        title: `Update roll call for ${name}?`,
        text: `${session} roll call for ${formatDate(date)} is already marked. ${diff ? `${diff} change(s) will overwrite the saved statuses.` : "The saved statuses will be re-submitted."}`,
        confirmText: "Update roll call",
        tone: "primary",
      }))) return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ saved: number; parents_notified: number }>("/api/hostel/roll-call", {
        method: "POST",
        body: JSON.stringify({ hostel_id: hostelId, date, session, entries: roster.map((r) => ({ student_id: r.student_id, status: r.status })) }),
      });
      toast.push(`Roll call saved for ${res.saved} students${res.parents_notified ? ` · ${res.parents_notified} parent(s) notified` : ""}`, "success");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<RcStatus, number> = { Present: 0, Absent: 0, "On Leave": 0 };
    for (const r of roster) c[r.status]++;
    return c;
  }, [roster]);
  const rooms = useMemo(() => [...new Set(roster.map((r) => r.room))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [roster]);
  const visible = roster.filter((r) => (!roomFilter || r.room === roomFilter) && (!statusFilter || r.status === statusFilter));
  const changed = roster.filter((r) => savedStatus[r.student_id] !== r.status).length;
  const absentees = report?.rows.filter((r) => r.status === "Absent") ?? [];
  const hostelName = hostels.find((h) => h.id === hostelId)?.name ?? "Hostel";

  /** Phones: one card per boarder — room/bed band, student, big status segments, last marked. */
  const mobileCards = visible.length === 0 ? (
    <CardEmpty
      icon="hostel"
      title={roster.length ? "No students match the filters" : "Nobody is allocated to this hostel"}
      hint={roster.length ? "Change the room or status filter." : undefined}
    />
  ) : visible.map((r) => {
    const prev = savedStatus[r.student_id];
    return (
      <MCard key={r.student_id} tone={toneFor(r.student.fullName)}>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/80 px-3.5 py-2.5">
          <p className="tnum text-[17px] font-bold tracking-tight text-ink">{r.room}</p>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 ring-1 ring-line">
            <Icon name="bed" className="h-4 w-4 text-ink-3" />
            {r.bed ?? "—"}
          </span>
        </div>

        <div className="mt-3.5">
          <MLabel>Student</MLabel>
          <div className="mt-2 flex items-start gap-3">
            <MAvatar name={r.student.fullName} tone={toneFor(r.student.fullName)} size={44} variant="soft" />
            <div className="min-w-0 flex-1">
              <p className="text-[16.5px] font-bold leading-snug text-ink">{r.student.fullName}</p>
              <p className="mt-0.5 text-[13px] text-ink-3">
                <span className="font-mono">{r.student.admissionNo}</span>
                {classLabel(r.student) ? ` · ${classLabel(r.student)}` : ""}
              </p>
              {r.leave_reason && <p className="mt-1 text-[12.5px] text-ink-2">{r.leave_reason}</p>}
            </div>
          </div>
        </div>

        <div className="my-3.5 border-t border-line" />

        <MLabel>Status</MLabel>
        {canMark ? (
          <div role="radiogroup" aria-label={`Status for ${r.student.fullName}`} className="mt-2 grid grid-cols-3 gap-2">
            {STATUSES.map((s) => {
              const on = r.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setStatus(r.student_id, s)}
                  onKeyDown={(e) => {
                    const i = STATUSES.indexOf(r.status);
                    if (e.key === "ArrowRight") { e.preventDefault(); setStatus(r.student_id, STATUSES[(i + 1) % 3]); }
                    if (e.key === "ArrowLeft") { e.preventDefault(); setStatus(r.student_id, STATUSES[(i + 2) % 3]); }
                  }}
                  tabIndex={on ? 0 : -1}
                  className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-1.5 text-[12.5px] font-semibold transition ${on ? MOBILE_SEG[s].on : MOBILE_SEG[s].off}`}
                >
                  <Icon name={MOBILE_SEG[s].icon} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{s}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-2"><Badge tone={STYLE[r.status].badge}>{r.status}</Badge></div>
        )}

        <div className="mt-3">
          <MPanel tone={prev ? "slate" : "ok"}>
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <Icon name="clock" className={`h-4 w-4 shrink-0 ${prev ? "text-ink-3" : "text-ok-ink"}`} />
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${prev ? "text-ink-3" : "text-ok-ink"}`}>
                  Last marked
                </p>
                <p className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">
                  {prev
                    ? `${prev} · ${r.marked_at ? new Date(r.marked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : formatDate(date)} · ${session}${r.marked_by_name ? ` · ${r.marked_by_name}` : ""}${prev !== r.status ? " · changed" : ""}`
                    : "Not marked"}
                </p>
              </div>
            </div>
          </MPanel>
        </div>
      </MCard>
    );
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          title="Roll call"
          icon="attendance"
          subtitle="Approved leaves and checked-out gate passes are pre-filled On Leave. Night-session absences alert the parent."
        />
        <div className="space-y-4 px-4 pb-4 sm:px-5 max-md:px-0">
          {/* Filter bar */}
          <div className="flex flex-wrap items-end gap-3 max-md:px-4">
            <label className="flex flex-col gap-1 max-md:min-w-[9rem] max-md:flex-1">
              <span className="text-[11.5px] font-semibold text-ink-3">Hostel</span>
              <Select aria-label="Hostel" className="w-auto max-md:!w-full" value={hostelId} onChange={(e) => { setHostelId(e.target.value); setRoomFilter(""); }}>
                {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 max-md:min-w-[9rem] max-md:flex-1">
              <span className="text-[11.5px] font-semibold text-ink-3">Date</span>
              <Input type="date" aria-label="Date" className="w-auto max-md:!w-full" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 max-md:min-w-[9rem] max-md:flex-1">
              <span className="text-[11.5px] font-semibold text-ink-3">Session</span>
              <Select aria-label="Session" className="w-auto max-md:!w-full" value={session} onChange={(e) => setSession(e.target.value as "Morning" | "Night")}>
                <option>Morning</option>
                <option>Night</option>
              </Select>
            </label>
            <MobileFilters active={[roomFilter, statusFilter].filter(Boolean).length} onClear={() => { setRoomFilter(""); setStatusFilter(""); }}>
            <label className="flex flex-col gap-1 max-md:min-w-[9rem] max-md:flex-1">
              <span className="text-[11.5px] font-semibold text-ink-3">Room</span>
              <Select aria-label="Filter by room" className="w-auto max-md:!w-full" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
                <option value="">All rooms</option>
                {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 max-md:min-w-[9rem] max-md:flex-1">
              <span className="text-[11.5px] font-semibold text-ink-3">Status</span>
              <Select aria-label="Filter by status" className="w-auto max-md:!w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | RcStatus)}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </label>
            </MobileFilters>
            {(roomFilter || statusFilter) && <Button variant="ghost" onClick={() => { setRoomFilter(""); setStatusFilter(""); }} className="max-md:flex-1 max-md:!hidden">Clear</Button>}
            {canMark && roster.length > 0 && (
              <Button variant="soft" className="ml-auto max-md:ml-0 max-md:flex-1" onClick={markAllPresent}><Icon name="check" className="h-4 w-4" /> Mark all present</Button>
            )}
          </div>

          {/* Counters (click to filter) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 max-md:px-4">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statusFilter === s}
                onClick={() => setStatusFilter((f) => (f === s ? "" : s))}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${statusFilter === s ? "border-brand-500 bg-brand-50" : "border-line bg-surface hover:bg-surface-2"}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${STYLE[s].dot}`} aria-hidden />
                <span className="text-[12px] text-ink-2">{s}</span>
                <span className="tnum ml-auto text-[18px] font-bold text-ink">{counts[s]}</span>
              </button>
            ))}
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
              <span className="text-[12px] text-ink-2">{marked ? "Already marked" : "Not marked yet"}</span>
              <span className="tnum ml-auto text-[18px] font-bold text-ink">{roster.length}</span>
            </div>
          </div>

          {/* Roster table */}
          <div className="card overflow-hidden max-md:contents">
            <div className="table-wrap max-md:contents">
              <TableView id="hostel-roster" mobileCards={loading && roster.length === 0 ? undefined : mobileCards}>
                <table className="data-table">
                  <thead>
                    <tr><th>Room</th><th>Bed</th><th>Student</th><th>Status</th><th>Last marked</th></tr>
                  </thead>
                  {loading && roster.length === 0 ? <SkeletonRows rows={6} cols={5} /> : (
                    <tbody>
                      {visible.length === 0 ? (
                        <tr><td colSpan={5}><EmptyState icon="hostel" title={roster.length ? "No students match the filters" : "Nobody is allocated to this hostel"} /></td></tr>
                      ) : visible.map((r) => {
                        const prev = savedStatus[r.student_id];
                        return (
                          <tr key={r.student_id} className="align-top">
                            <td className="tnum whitespace-nowrap font-semibold">{r.room}</td>
                            <td className="tnum whitespace-nowrap text-ink-2">{r.bed ?? "—"}</td>
                            <td>
                              <div className="flex items-center gap-3">
                                <Monogram text={initials(r.student.fullName)} tone={toneFor(r.student.fullName)} shape="circle" size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-ink">{r.student.fullName}</p>
                                  <p className="text-[11.5px] text-ink-3"><span className="font-mono">{r.student.admissionNo}</span>{classLabel(r.student) ? ` · ${classLabel(r.student)}` : ""}</p>
                                  {r.leave_reason && <p className="text-[11.5px] text-ink-2">{r.leave_reason}</p>}
                                </div>
                              </div>
                            </td>
                            <td>
                              {canMark ? (
                                <div role="radiogroup" aria-label={`Status for ${r.student.fullName}`} className="inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-1 max-md:flex max-md:w-full">
                                  {STATUSES.map((s) => {
                                    const on = r.status === s;
                                    return (
                                      <button
                                        key={s}
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        onClick={() => setStatus(r.student_id, s)}
                                        onKeyDown={(e) => {
                                          const i = STATUSES.indexOf(r.status);
                                          if (e.key === "ArrowRight") { e.preventDefault(); setStatus(r.student_id, STATUSES[(i + 1) % 3]); }
                                          if (e.key === "ArrowLeft") { e.preventDefault(); setStatus(r.student_id, STATUSES[(i + 2) % 3]); }
                                        }}
                                        tabIndex={on ? 0 : -1}
                                        className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition max-md:min-h-11 max-md:flex-1 max-md:text-[13px] ${on ? STYLE[s].on : "text-ink-2 hover:bg-surface"}`}
                                      >
                                        {s}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : <Badge tone={STYLE[r.status].badge}>{r.status}</Badge>}
                            </td>
                            <td className="whitespace-nowrap">
                              {prev ? (
                                <span className="flex flex-col gap-0.5">
                                  <Badge tone={STYLE[prev].badge}>{prev}</Badge>
                                  <span className="text-[11px] text-ink-3">{r.marked_at ? new Date(r.marked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : formatDate(date)} · {session}{r.marked_by_name ? ` · ${r.marked_by_name}` : ""}{prev !== r.status ? " · changed" : ""}</span>
                                </span>
                              ) : <span className="text-[12px] text-ink-3">Not marked</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  )}
                </table>
              </TableView>
            </div>
          </div>
        </div>

        {/* Sticky save bar */}
        {canMark && roster.length > 0 && (
          <div className="m-above-nav sticky bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-5 max-md:px-3 max-md:py-2.5">
            {/* Desktop unchanged */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-md:hidden">
              <p className="tnum text-[13px] text-ink-2">
                <span className="font-semibold text-ink">{hostelName}</span> · {formatDate(date)} · {session} ·{" "}
                <span className="font-semibold text-ok-ink">{counts.Present} present</span> ·{" "}
                <span className="font-semibold text-danger-ink">{counts.Absent} absent</span> ·{" "}
                <span className="font-semibold text-ink-2">{counts["On Leave"]} on leave</span>
              </p>
              <p className="text-[12.5px] text-ink-3">
                {marked ? `${changed} change${changed === 1 ? "" : "s"} since last save` : "Not saved yet"}
                {session === "Night" && counts.Absent > 0 ? ` · parents of absent students will be alerted` : ""}
              </p>
              <Button variant="primary" className="ml-auto max-md:ml-0 max-md:w-full" loading={saving} onClick={save}>
                <Icon name="check" className="h-4 w-4" /> {marked ? "Update roll call" : "Save roll call"}
              </Button>
            </div>

            {/* Phones: hostel summary + count tiles + full-width save */}
            <div className="md:hidden">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon name="hostel" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold leading-tight text-ink">{hostelName}</p>
                  <p className="mt-0.5 truncate text-[12px] text-ink-3">{formatDate(date)} · {session}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {([["Present", "ok", counts.Present], ["Absent", "danger", counts.Absent], ["On leave", "warn", counts["On Leave"]]] as const).map(([label, tone, value]) => (
                  <div
                    key={label}
                    className={`rounded-xl px-2 py-1.5 text-center ${tone === "ok" ? "bg-ok-soft text-ok-ink" : tone === "danger" ? "bg-danger-soft text-danger-ink" : "bg-warn-soft text-warn-ink"}`}
                  >
                    <p className="tnum text-[18px] font-bold leading-none">{value}</p>
                    <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.04em]">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${marked ? "bg-ok" : "bg-warn"}`} aria-hidden />
                {marked
                  ? `${changed} change${changed === 1 ? "" : "s"} since last save`
                  : "Not saved yet"}
                {session === "Night" && counts.Absent > 0 ? " · parents of absent students will be alerted" : ""}
              </p>
              <Button variant="dark" className="mt-2 w-full !min-h-12" loading={saving} onClick={save}>
                <Icon name="check" className="h-4 w-4" /> {marked ? "Update roll call" : "Save roll call"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="Last 7 days" icon="reports" subtitle={`${absentees.length} absence(s) recorded`} />
        <div className="px-4 pb-4 sm:px-5">
          {report && report.summary.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Session</th><th className="th-end">Present</th><th className="th-end">Absent</th><th className="th-end">On leave</th></tr></thead>
                  <tbody>
                    {report.summary.map((s) => (
                      <tr key={`${s.date}-${s.session}`}>
                        <td className="tnum whitespace-nowrap">{formatDate(s.date)}</td>
                        <td>{s.session}</td>
                        <td className="td-end tnum text-ok-ink">{s.Present}</td>
                        <td className="td-end tnum text-danger-ink">{s.Absent}</td>
                        <td className="td-end tnum text-ink-2">{s["On Leave"]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-1 text-sm">
                {absentees.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-danger-soft/40 px-3 py-1.5">
                    <span className="min-w-0 truncate">{a.student.fullName} <span className="font-mono text-xs text-ink-3">{a.student.admissionNo}</span></span>
                    <span className="tnum shrink-0 text-xs">{formatDate(a.date)} · {a.session}</span>
                  </li>
                ))}
                {absentees.length === 0 && <li className="text-ink-3">No absences.</li>}
              </ul>
            </div>
          ) : <p className="text-sm text-ink-3">No roll calls recorded in the last 7 days.</p>}
        </div>
      </Card>
    </div>
  );
}
