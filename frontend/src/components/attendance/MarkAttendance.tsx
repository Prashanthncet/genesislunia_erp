"use client";

/**
 * Mark attendance for one class (one section) on one date.
 * - Roster rows: roll, initials, name, segmented status P / A (see MARK_STATUSES in status.tsx).
 * - Keyboard: Tab into a row's control, ←/→ to move, P A L O V to set, ↑/↓ to change row.
 * - OD needs a reason (inline input) — Save stays disabled until every OD has one.
 * - Students on approved leave that day are pre-filled as Leave.
 * - Sticky save bar: live counts + how many parent absence SMS / e-mails will go out.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { apiFetch } from "@/lib/api";
import { confirmAction } from "@/components/confirm";
import { formatDate } from "@/lib/format";
import { Button, EmptyState, Icon, Input, Select, SkeletonRows } from "@/components/ui";
import { CardEmpty, Monogram, initials, toneFor } from "@/components/RecordCard";
import { MAvatar, MLabel } from "@/components/mobile/MobileCard";
import { TableView } from "@/components/TableView";
import { ClassSectionSelect, resolveClass, selFor, type ClassOpt, type ClassSel } from "./ClassSectionSelect";
import { ATT_STATUSES, MARK_STATUSES, AttendanceLegend, STATUS_LONG, STATUS_META, StatusTag, todayLocal, type AttStatus } from "./status";

type SheetStudent = {
  id: string; full_name: string; roll_no: string | null; admission_no: string;
  status: AttStatus | null; note: string | null; notified: boolean;
  on_leave: { leave_type: string; reason: string | null; from: string; to: string } | null;
  contact_reachable: boolean;
};
type Sheet = {
  class: { id: string; name: string; section: string | null; label: string } | null;
  date: string; is_sunday: boolean; already_marked: boolean; marked_count: number;
  students: SheetStudent[];
};
type Entry = { status: AttStatus; reason: string };

export function MarkAttendance({
  classes, canMark, onMessage, onOpenStudent,
}: {
  classes: ClassOpt[];
  canMark: boolean;
  onMessage: (m: string) => void;
  onOpenStudent: (s: { id: string; name: string }) => void;
}) {
  const [sel, setSel] = useState<ClassSel>(() => selFor(classes[0]));
  const [date, setDate] = useState(todayLocal);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | AttStatus>("");
  const [query, setQuery] = useState("");
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => { if (!sel.className && classes[0]) setSel(selFor(classes[0])); }, [classes, sel.className]);
  const cls = resolveClass(classes, sel);

  const load = useCallback(async () => {
    if (!cls || !date) { setSheet(null); return; }
    setLoading(true);
    try {
      const s = await apiFetch<Sheet>(`/api/attendance/sheet?class_id=${cls.id}&date=${date}`);
      setSheet(s);
      const next: Record<string, Entry> = {};
      for (const st of s.students) {
        next[st.id] = st.status
          ? { status: st.status, reason: st.note ?? "" }
          : st.on_leave
            ? { status: "Leave", reason: st.on_leave.reason ?? `${st.on_leave.leave_type} leave` }
            : { status: "Present", reason: "" };
      }
      setEntries(next);
    } catch (e) {
      setSheet(null);
      onMessage(e instanceof Error ? e.message : "Could not load the class");
    } finally {
      setLoading(false);
    }
  }, [cls, date, onMessage]);
  useEffect(() => { load(); }, [load]);

  const students = sheet?.students ?? [];
  const setStatus = (id: string, status: AttStatus) =>
    setEntries((e) => ({ ...e, [id]: { status, reason: e[id]?.status === status ? e[id].reason : "" } }));
  const setReason = (id: string, reason: string) => setEntries((e) => ({ ...e, [id]: { ...e[id], reason } }));
  const markAllPresent = () =>
    setEntries((e) => Object.fromEntries(students.map((s) => [s.id, s.on_leave ? e[s.id] : { status: "Present" as AttStatus, reason: "" }])));

  const counts = useMemo(() => {
    const c: Record<AttStatus, number> = { Present: 0, Absent: 0, Late: 0, OD: 0, Leave: 0 };
    for (const s of students) c[entries[s.id]?.status ?? "Present"]++;
    return c;
  }, [students, entries]);
  const missingOd = students.filter((s) => entries[s.id]?.status === "OD" && !entries[s.id].reason.trim());
  // A notice goes out for a student who will be Absent unless they were already Absent AND notified.
  const smsOut = students.filter((s) => entries[s.id]?.status === "Absent" && !(s.status === "Absent" && s.notified) && s.contact_reachable).length;
  const noContact = students.filter((s) => entries[s.id]?.status === "Absent" && !(s.status === "Absent" && s.notified) && !s.contact_reachable).length;
  const changed = students.filter((s) => {
    const e = entries[s.id];
    return !s.status || e.status !== s.status || (e.reason || "") !== (s.note ?? "");
  }).length;
  const attended = counts.Present + counts.Late + counts.OD;
  const counted = attended + counts.Absent;

  const visible = students.filter((s) =>
    (!statusFilter || entries[s.id]?.status === statusFilter) &&
    (!query || `${s.full_name} ${s.roll_no ?? ""} ${s.admission_no}`.toLowerCase().includes(query.toLowerCase())),
  );

  const save = async () => {
    if (!cls || !students.length || missingOd.length) return;
    // Re-saving an already-marked register overwrites it — confirm first. First-time save needs none.
    if (sheet?.already_marked && !(await confirmAction({
      title: `Update attendance for ${cls.name}${cls.section ? ` ${cls.section}` : ""}?`,
      text: `${changed} change${changed === 1 ? "" : "s"} to the saved register for ${formatDate(date)}.${smsOut > 0 ? ` ${smsOut} parent absence notice${smsOut === 1 ? "" : "s"} will go out.` : ""}`,
      confirmText: "Update attendance",
      tone: "primary",
    }))) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ count: number; notified: number; notify_skipped: number; notify_failed: number }>("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          class_id: cls.id,
          date,
          records: students.map((s) => {
            const e = entries[s.id];
            return { student_id: s.id, status: e.status, ...(e.reason.trim() ? { reason: e.reason.trim() } : {}) };
          }),
        }),
      });
      const extra = res.notified || res.notify_skipped || res.notify_failed
        ? ` · ${res.notified} parent notice${res.notified === 1 ? "" : "s"} sent${res.notify_skipped ? `, ${res.notify_skipped} without contact` : ""}${res.notify_failed ? `, ${res.notify_failed} failed` : ""}`
        : "";
      onMessage(`Attendance saved for ${res.count} students${extra}`);
      await load();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resend = async () => {
    if (!cls) return;
    if (!(await confirmAction({
      title: `Resend absence notices for ${cls.name}${cls.section ? ` ${cls.section}` : ""}?`,
      text: `Parents of absent students who have not been notified for ${formatDate(date)} will get an SMS / e-mail.`,
      confirmText: "Send notices",
      tone: "primary",
    }))) return;
    setResending(true);
    try {
      const r = await apiFetch<{ notified: number; skipped: number; failed: number }>("/api/attendance/notify-absent", {
        method: "POST", body: JSON.stringify({ date, class_id: cls.id }),
      });
      onMessage(r.notified + r.skipped + r.failed === 0
        ? "No pending absence notices for this class and date"
        : `Absence notices sent to ${r.notified}${r.skipped ? ` (${r.skipped} without contact)` : ""}${r.failed ? ` · ${r.failed} failed` : ""}`);
      await load();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Resend failed");
    } finally {
      setResending(false);
    }
  };

  /** Keyboard on a row's status control. */
  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, id: string, index: number) => {
    if (!canMark) return;
    const cur = entries[id]?.status ?? "Present";
    const i = MARK_STATUSES.indexOf(cur);
    const byKey = MARK_STATUSES.find((s) => STATUS_META[s].key === e.key.toLowerCase());
    if (byKey && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setStatus(id, byKey); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); setStatus(id, MARK_STATUSES[(i + 1) % MARK_STATUSES.length]); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setStatus(id, MARK_STATUSES[(i - 1 + MARK_STATUSES.length) % MARK_STATUSES.length]); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      rowRefs.current[index + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
    }
  };

  /** Phones: one card per student — avatar, name/roll, Status label, 5 segments. */
  const mobileCards = visible.length === 0 ? (
    <CardEmpty icon="students" title={students.length ? "No students match" : "No active students in this class"} />
  ) : visible.map((s) => {
    const e = entries[s.id] ?? { status: "Present" as AttStatus, reason: "" };
    const idx = students.indexOf(s);
    const odMissing = e.status === "OD" && !e.reason.trim();
    return (
      <article key={s.id} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <MAvatar name={s.full_name} tone={toneFor(s.full_name)} size={56} variant="soft" />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpenStudent({ id: s.id, name: s.full_name })}
              title="Open attendance calendar"
              className="block max-w-full truncate text-left text-[17px] font-bold leading-snug max-md:!text-[15px] text-ink active:text-brand-700"
            >
              {s.full_name}
            </button>
            <p className="mt-0.5 text-[13px] text-ink-3"><span className="tnum">Roll {s.roll_no ?? "—"}</span></p>
            {s.on_leave && (
              <p className="mt-1 text-[12px] text-ink-2">On approved {s.on_leave.leave_type.toLowerCase()} leave</p>
            )}
          </div>
        </div>

        <div className="my-3 border-t border-line" />
        <MLabel>Status</MLabel>
        <div
          ref={(el) => { rowRefs.current[idx] = el; }}
          role="radiogroup"
          aria-label={`Status for ${s.full_name}`}
          tabIndex={canMark ? 0 : -1}
          onKeyDown={(ev) => onRowKey(ev, s.id, idx)}
          className="mt-2 flex items-stretch gap-0.5 rounded-xl border border-line bg-surface-2 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {MARK_STATUSES.map((st) => {
            const on = e.status === st;
            return (
              <button
                key={st}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={-1}
                disabled={!canMark}
                title={`${STATUS_LONG[st]} (key ${STATUS_META[st].key.toUpperCase()})`}
                onClick={() => setStatus(s.id, st)}
                className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 text-[13px] font-bold transition disabled:cursor-not-allowed ${on ? STATUS_META[st].on : "text-ink-2"}`}
              >
                {on && st === "Present" && <Icon name="check" className="h-4 w-4 shrink-0" />}
                <span className="truncate">{STATUS_META[st].short === "Lv" ? "Leave" : STATUS_META[st].short}</span>
              </button>
            );
          })}
        </div>

        {(e.status === "OD" || e.status === "Leave") && (
          <div className="mt-2">
            <Input
              aria-label={e.status === "OD" ? `OD reason for ${s.full_name}` : `Leave remark for ${s.full_name}`}
              placeholder={e.status === "OD" ? "OD reason (required) — e.g. NCC camp" : "Remark (optional)"}
              value={e.reason}
              maxLength={300}
              disabled={!canMark}
              onChange={(ev) => setReason(s.id, ev.target.value)}
              className={`!text-[13px] ${odMissing ? "border-danger" : ""}`}
              aria-invalid={odMissing}
            />
            {odMissing && <p className="mt-1 text-[11.5px] font-medium text-danger">A reason is required for OD.</p>}
          </div>
        )}

        {s.status && (
          <p className="mt-2 text-[12px] text-ink-3">
            Saved: {STATUS_META[s.status].label}
            {s.status === "Absent" ? (s.notified ? " · parent notified" : " · notice pending") : ""}
          </p>
        )}
      </article>
    );
  });

  const today = todayLocal();
  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <ClassSectionSelect classes={classes} value={sel} onChange={setSel} />
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-3">Date</span>
          <Input type="date" aria-label="Attendance date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-3">Show</span>
          <Select aria-label="Filter roster by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | AttStatus)} className="w-auto">
            <option value="">All statuses</option>
            {ATT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </Select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-3">Find</span>
          <Input type="search" aria-label="Find student" placeholder="Name, roll or admission no" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {canMark && (
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={markAllPresent} disabled={!students.length}><Icon name="check" className="h-4 w-4" /> Mark all present</Button>
            <Button variant="ghost" onClick={resend} loading={resending} disabled={!sheet?.already_marked} title="Send absence notices that have not gone out yet">
              <Icon name="mail" className="h-4 w-4" /> Resend notices
            </Button>
          </div>
        )}
      </div>

      {/* State banners */}
      {sheet?.is_sunday && (
        <p className="rounded-lg border border-warn-line bg-warn-soft px-4 py-2.5 text-[13px] text-warn-ink">
          {formatDate(date)} is a Sunday — records saved for it are not counted in attendance %.
        </p>
      )}
      {sheet?.already_marked && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-ok-line bg-ok-soft px-4 py-2.5 text-[13px] text-ok-ink">
          <Icon name="check" className="h-4 w-4" />
          Already marked for {formatDate(date)} — {sheet.marked_count} of {students.length} saved. Changes update the saved register.
        </p>
      )}

      {/* Live counters */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ATT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter((f) => (f === s ? "" : s))}
            aria-pressed={statusFilter === s}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${statusFilter === s ? "border-brand-500 bg-brand-50" : "border-line bg-surface hover:bg-surface-2"}`}
          >
            <span className={`grid h-7 min-w-7 place-items-center rounded-md px-1 text-[11px] font-bold ring-1 ${STATUS_META[s].cell}`}>{STATUS_META[s].short}</span>
            <span className="text-[12px] text-ink-2">{STATUS_META[s].label}</span>
            <span className={`tnum ml-auto text-[18px] font-bold ${STATUS_META[s].text}`}>{counts[s]}</span>
          </button>
        ))}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          <span className="text-[12px] text-ink-2">Attendance</span>
          <span className="tnum ml-auto text-[18px] font-bold text-ink">{counted ? `${Math.round((attended / counted) * 1000) / 10}%` : "—"}</span>
        </div>
      </div>

      {/* Roster */}
      <div className="card overflow-hidden max-md:contents">
        {!cls ? (
          <EmptyState icon="check" title="Choose a class and section" hint="Pick the class, then its section, to load the roster." />
        ) : (
          <div className="table-wrap max-md:contents">
            <TableView id="att-mark" title="Student" mobileHide={["Saved"]} mobileCards={loading && !sheet ? undefined : mobileCards}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="th-end w-16">Roll</th>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Saved</th>
                  </tr>
                </thead>
                {loading && !sheet ? <SkeletonRows rows={8} cols={4} /> : (
                  <tbody className="divide-y divide-line">
                    {visible.length === 0 ? (
                      <tr><td colSpan={4}><EmptyState icon="students" title={students.length ? "No students match" : "No active students in this class"} /></td></tr>
                    ) : visible.map((s) => {
                      const e = entries[s.id] ?? { status: "Present" as AttStatus, reason: "" };
                      const idx = students.indexOf(s);
                      const odMissing = e.status === "OD" && !e.reason.trim();
                      return (
                        <tr key={s.id} className="align-top">
                          <td className="td-end tnum font-semibold text-ink-2"><span className="max-md:text-left">{s.roll_no ?? "—"}</span></td>
                          <td>
                            <div className="flex items-center gap-3">
                              <Monogram text={initials(s.full_name)} tone={toneFor(s.full_name)} shape="circle" />
                              <div className="min-w-0">
                                <button type="button" onClick={() => onOpenStudent({ id: s.id, name: s.full_name })} className="truncate text-left font-semibold text-ink hover:text-brand-700 hover:underline max-md:min-h-10 max-md:inline-flex max-md:items-center max-md:max-w-full" title="Open attendance calendar">
                                  <span className="max-md:truncate">{s.full_name}</span>
                                </button>
                                <p className="font-mono text-[11px] text-ink-3 max-md:hidden">{s.admission_no}</p>
                                {s.on_leave && (
                                  <p className="mt-0.5 text-[11.5px] text-ink-2">On approved {s.on_leave.leave_type.toLowerCase()} leave ({formatDate(s.on_leave.from)} – {formatDate(s.on_leave.to)})</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div
                              ref={(el) => { rowRefs.current[idx] = el; }}
                              role="radiogroup"
                              aria-label={`Status for ${s.full_name}`}
                              tabIndex={canMark ? 0 : -1}
                              onKeyDown={(ev) => onRowKey(ev, s.id, idx)}
                              className="inline-flex flex-wrap gap-1 max-md:flex max-md:w-full max-md:flex-nowrap rounded-lg border border-line bg-surface-2 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              {MARK_STATUSES.map((st) => {
                                const on = e.status === st;
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    tabIndex={-1}
                                    disabled={!canMark}
                                    title={`${STATUS_LONG[st]} (key ${STATUS_META[st].key.toUpperCase()})`}
                                    onClick={() => setStatus(s.id, st)}
                                    className={`min-w-9 rounded-md px-2.5 py-1.5 text-[12px] font-bold transition max-md:min-h-11 max-md:flex-1 max-md:px-1 max-md:text-[13px] ${on ? STATUS_META[st].on : "text-ink-2 hover:bg-surface"} disabled:cursor-not-allowed`}
                                  >
                                    {STATUS_META[st].short === "Lv" ? "Leave" : STATUS_META[st].short}
                                  </button>
                                );
                              })}
                            </div>
                            {(e.status === "OD" || e.status === "Leave") && (
                              <div className="mt-1.5 max-w-xs">
                                <Input
                                  aria-label={e.status === "OD" ? `OD reason for ${s.full_name}` : `Leave remark for ${s.full_name}`}
                                  placeholder={e.status === "OD" ? "OD reason (required) — e.g. NCC camp" : "Remark (optional)"}
                                  value={e.reason}
                                  maxLength={300}
                                  disabled={!canMark}
                                  onChange={(ev) => setReason(s.id, ev.target.value)}
                                  className={`!py-1.5 text-[12.5px] ${odMissing ? "border-danger" : ""}`}
                                  aria-invalid={odMissing}
                                />
                                {odMissing && <p className="mt-1 text-[11px] font-medium text-danger">A reason is required for OD.</p>}
                              </div>
                            )}
                          </td>
                          <td>
                            {s.status ? (
                              <div className="flex flex-col items-start gap-1">
                                <StatusTag status={s.status} />
                                {s.status === "Absent" && <span className="text-[11px] text-ink-3">{s.notified ? "Parent notified" : "Notice pending"}</span>}
                              </div>
                            ) : <span className="text-[12px] text-ink-3">Not saved</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                )}
              </table>
            </TableView>
          </div>
        )}
      </div>

      <AttendanceLegend />

      {/* Sticky save bar */}
      {canMark && cls && students.length > 0 && (
        <div className="m-above-nav sticky bottom-0 z-20 -mx-1 rounded-t-xl border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur max-md:px-3 max-md:py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-md:gap-y-1.5">
            <p className="tnum text-[13px] text-ink-2 max-md:text-[12px] max-md:leading-snug">
              <span className="max-md:block"><span className="font-semibold text-ink">{cls.name} {cls.section ?? ""}</span> · {formatDate(date)}<span className="max-md:hidden"> ·{" "}</span></span>
              <span className="font-semibold text-ok-ink">{counts.Present} P</span> ·{" "}
              <span className="font-semibold text-danger-ink">{counts.Absent} A</span> ·{" "}
              <span className="font-semibold text-warn-ink">{counts.Late} L</span> ·{" "}
              <span className="font-semibold text-info-ink">{counts.OD} OD</span> ·{" "}
              <span className="font-semibold text-ink-2">{counts.Leave} Leave</span>
            </p>
            <p className="text-[12.5px] text-ink-3 max-md:text-[11.5px] max-md:leading-snug">
              {smsOut > 0 ? `${smsOut} parent absence SMS/e-mail will go out` : "No parent notices will be sent"}
              {noContact > 0 ? ` · ${noContact} absent without contact details` : ""}
              {sheet?.already_marked ? ` · ${changed} change${changed === 1 ? "" : "s"}` : ""}
            </p>
            <Button variant="primary" className="ml-auto max-md:ml-0 max-md:w-full" onClick={save} loading={saving} disabled={missingOd.length > 0}>
              <Icon name="check" className="h-4 w-4" /> {sheet?.already_marked ? "Update attendance" : "Save attendance"}
            </Button>
          </div>
          {missingOd.length > 0 && (
            <p className="mt-1.5 text-[12px] max-md:text-[11.5px] font-medium text-danger">Add an OD reason for {missingOd.map((s) => s.full_name).join(", ")}.</p>
          )}
        </div>
      )}
    </div>
  );
}
