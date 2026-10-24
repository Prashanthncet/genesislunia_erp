"use client";

/** Absentee list with a filter bar: date or range, class, section, status, "not yet notified". */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Button, EmptyState, Icon, IconButton, Input, Select, SkeletonRows, Tabs } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { ClassSectionSelect, classQuery, type ClassOpt, type ClassSel } from "./ClassSectionSelect";
import { StatusTag, todayLocal } from "./status";

type Row = {
  record_id: string; date: string; status: string; student_id: string; full_name: string; roll_no: string | null;
  admission_no: string; contact: string | null; notified: boolean; note: string | null; class_id: string; class_name: string;
};
type Report = {
  date: string | null; from: string; to: string; status: string; not_notified: boolean;
  total: number; total_absent: number; total_late: number; pending_notices: number; rows: Row[];
};
type Filters = { mode: "day" | "range"; date: string; from: string; to: string; cls: ClassSel; status: "Absent" | "Late" | "both"; notNotified: boolean };

const initial = (): Filters => ({ mode: "day", date: todayLocal(), from: "", to: "", cls: { className: "", section: "" }, status: "Absent", notNotified: false });

export function AbsenteesView({
  classes, canMark, onMessage, onOpenStudent,
}: {
  classes: ClassOpt[];
  canMark: boolean;
  onMessage: (m: string) => void;
  onOpenStudent: (s: { id: string; name: string }) => void;
}) {
  const [draft, setDraft] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const query = useCallback((f: Filters) => {
    const q = new URLSearchParams(classQuery(classes, f.cls));
    if (f.mode === "day") q.set("date", f.date);
    else { if (f.from) q.set("from", f.from); if (f.to) q.set("to", f.to); }
    if (f.notNotified) q.set("not_notified", "1");
    else q.set("status", f.status);
    return q.toString();
  }, [classes]);

  const load = useCallback(async () => {
    if (applied.mode === "range" && !applied.from && !applied.to) return;
    setLoading(true);
    try {
      setData(await apiFetch<Report>(`/api/attendance/absentees?${query(applied)}`));
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Absentee report failed");
    } finally {
      setLoading(false);
    }
  }, [applied, query, onMessage]);
  useEffect(() => { load(); }, [load]);

  const apply = () => setApplied({ ...draft });
  const clear = () => { const f = initial(); setDraft(f); setApplied(f); };
  const rangeInvalid = draft.mode === "range" && (!draft.from && !draft.to || (!!draft.from && !!draft.to && draft.from > draft.to));

  const sendPending = async () => {
    if (applied.mode !== "day") return;
    setSending(true);
    try {
      const cq = classQuery(classes, applied.cls);
      const r = await apiFetch<{ notified: number; skipped: number; failed: number }>("/api/attendance/notify-absent", {
        method: "POST", body: JSON.stringify({ date: applied.date, ...(cq.class_id ? { class_id: cq.class_id } : {}) }),
      });
      onMessage(r.notified + r.skipped + r.failed === 0 ? "No pending absence notices" : `Absence notices sent to ${r.notified}${r.skipped ? ` (${r.skipped} without contact)` : ""}${r.failed ? ` · ${r.failed} failed` : ""}`);
      await load();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Sending notices failed");
    } finally {
      setSending(false);
    }
  };

  const rows = data?.rows ?? [];
  const summary = data
    ? `${data.total} record${data.total === 1 ? "" : "s"}${data.status === "both" ? ` (${data.total_absent} absent, ${data.total_late} late)` : ""} · ${data.date ? formatDate(data.date) : `${formatDate(data.from)} – ${formatDate(data.to)}`}${data.pending_notices ? ` · ${data.pending_notices} notice${data.pending_notices === 1 ? "" : "s"} pending` : ""}`
    : "";

  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); if (!rangeInvalid) apply(); }}>
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-3">Period</span>
          <Tabs tabs={[{ id: "day", label: "One day" }, { id: "range", label: "Date range" }] as const} value={draft.mode} onChange={(mode) => setDraft({ ...draft, mode })} />
        </div>
        {draft.mode === "day" ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-ink-3">Date</span>
            <Input type="date" aria-label="Date" value={draft.date} max={todayLocal()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="w-auto" />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-3">From</span>
              <Input type="date" aria-label="From date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="w-auto" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-3">To</span>
              <Input type="date" aria-label="To date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="w-auto" />
            </label>
          </>
        )}
        <ClassSectionSelect classes={classes} value={draft.cls} onChange={(cls) => setDraft({ ...draft, cls })} allowAll />
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-3">Status</span>
          <Select aria-label="Status" value={draft.status} disabled={draft.notNotified} onChange={(e) => setDraft({ ...draft, status: e.target.value as Filters["status"] })} className="w-auto">
            <option value="Absent">Absent</option>
            <option value="Late">Late</option>
            <option value="both">Absent + Late</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 self-center pt-5 text-[13px] text-ink-2">
          <input type="checkbox" checked={draft.notNotified} onChange={(e) => setDraft({ ...draft, notNotified: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand-700)]" />
          Not yet notified
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={rangeInvalid}><Icon name="filter" className="h-4 w-4" /> Apply</Button>
          <Button type="button" variant="ghost" onClick={clear}>Clear</Button>
        </div>
        {rangeInvalid && <p className="w-full text-[12px] text-danger">Pick a start and/or end date (start on or before end).</p>}
      </form>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[13px] text-ink-2"><span className="font-semibold text-ink">Absentees</span>{summary ? ` · ${summary}` : ""}</p>
          {canMark && applied.mode === "day" && (data?.pending_notices ?? 0) > 0 && (
            <Button size="sm" variant="soft" onClick={sendPending} loading={sending}><Icon name="mail" className="h-4 w-4" /> Send pending notices</Button>
          )}
        </div>
        <div className="table-wrap">
          <TableView id="att-absentees">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Date</th>
                  <th>Class</th>
                  <th className="th-end">Roll</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th>Parent notice</th>
                  <th className="th-end">Actions</th>
                </tr>
              </thead>
              {loading && !data ? <SkeletonRows rows={6} cols={8} /> : (
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={8}><EmptyState icon="check" title="No matching records" hint="Nobody matches these filters (or the register has not been taken yet)." /></td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.record_id}>
                      <td>
                        <span className="font-semibold text-ink">{r.full_name}</span>
                        <span className="ml-2 font-mono text-[11px] text-ink-3">{r.admission_no}</span>
                      </td>
                      <td className="tnum whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="whitespace-nowrap">{r.class_name}</td>
                      <td className="td-end tnum">{r.roll_no ?? "—"}</td>
                      <td><StatusTag status={r.status} /></td>
                      <td className="font-mono text-[12px] text-ink-2">{r.contact ?? "—"}</td>
                      <td>
                        {r.status === "Absent"
                          ? <Badge tone={r.notified ? "emerald" : "amber"}>{r.notified ? "Sent" : "Pending"}</Badge>
                          : <span className="text-[12px] text-ink-3">Not sent for Late</span>}
                      </td>
                      <td className="td-end">
                        <IconButton name="calendar" label={`Attendance calendar for ${r.full_name}`} variant="ghost" onClick={() => onOpenStudent({ id: r.student_id, name: r.full_name })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </TableView>
        </div>
      </div>
    </div>
  );
}
