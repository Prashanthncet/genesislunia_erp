"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasRole, type Me } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, IconButton, Input, Select, SkeletonRows, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { MobileFilters } from "@/components/mobile/MobileFilters";
import { MAvatar, MCard, MChip, MPanel, MStat } from "@/components/mobile/MobileCard";
import { CardEmpty, CardGrid, CardBody, CardFooter, CardTitle, Chip, Metric, Monogram, RecordCard, StatusPill, initials, toneFor } from "@/components/RecordCard";
import { GATE_PRINT, classLabel, errMsg, fmtStamp, fmtTime, statusBadge } from "@/components/leaves/shared";
import { PASS_STATUSES, type FilterOptions, type PassRecord, type RecordsResponse } from "./types";

type Filters = { status: string; from: string; to: string; class_id: string; hostel_id: string; q: string; late: boolean };
const EMPTY: Filters = { status: "", from: "", to: "", class_id: "", hostel_id: "", q: "", late: false };
const ISSUED = ["Approved", "Checked Out", "Returned"];

function toQuery(f: Filters, sort: "asc" | "desc", extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.class_id) p.set("class_id", f.class_id);
  if (f.hostel_id) p.set("hostel_id", f.hostel_id);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.late) p.set("late", "1");
  p.set("sort", sort);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

/**
 * Gate Desk → Pass records: every pass in the school, filtered, sortable by out time,
 * printable (issued passes) and exportable as CSV. The register never includes pass codes or OTPs.
 */
export function PassRecordsPanel({ me, refreshKey }: { me: Me; refreshKey?: number }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<FilterOptions>({ classes: [], hostels: [] });
  const [exporting, setExporting] = useState(false);
  const canPrint = hasRole(me, GATE_PRINT);

  useEffect(() => {
    apiFetch<FilterOptions>("/api/gate-passes/filters").then(setOptions).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<RecordsResponse>(`/api/gate-passes/records?${toQuery(applied, sort)}`));
    } catch (e) {
      setData({ total: 0, truncated: false, rows: [] });
      toast.push(errMsg(e, "Could not load pass records"), "error");
    } finally {
      setLoading(false);
    }
  }, [applied, sort, toast]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const badRange = !!draft.from && !!draft.to && draft.from > draft.to;
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const active = JSON.stringify(applied) !== JSON.stringify(EMPTY);

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (badRange) return;
    setApplied({ ...draft });
  };
  const clear = () => { setDraft(EMPTY); setApplied(EMPTY); };

  const exportCsv = async () => {
    setExporting(true);
    try { await apiDownload(`/api/gate-passes/records?${toQuery(applied, sort, { format: "csv" })}`, "gate-pass-records.csv"); }
    catch (e) { toast.push(errMsg(e, "Export failed"), "error"); }
    finally { setExporting(false); }
  };

  const print = async (r: PassRecord) => {
    try { await apiDownload(`/api/gate-passes/${r.id}/pass.pdf`, `gate-pass-${r.id}.pdf`); }
    catch (e) { toast.push(errMsg(e, "Download failed"), "error"); }
  };

  const rows = data?.rows ?? [];
  const lateCount = rows.filter((r) => r.late).length;

  const cards = (
    <CardGrid min="19rem" empty={<CardEmpty icon="door" title="No passes match" hint="Change or clear the filters." />}>
      {rows.map((r) => (
        <RecordCard key={r.id} rail={r.late ? "danger" : undefined}>
          <CardBody>
            <CardTitle
              lead={<Monogram text={initials(r.student.fullName)} tone={toneFor(r.student.fullName)} />}
              title={r.student.fullName}
              subtitle={<><span className="font-mono">{r.student.admissionNo}</span>{classLabel(r.student.class) && ` · ${classLabel(r.student.class)}`}</>}
              aside={<StatusPill status={r.status} />}
            />
            <div className="flex flex-wrap gap-1.5">
              <Chip icon="door">{r.type}</Chip>
              {r.hostel && <Chip icon="hostel" tone="sky">{r.hostel.name} · {r.hostel.room}</Chip>}
              {r.late && <Chip icon="alert" tone="danger">Late</Chip>}
            </div>
            <p className="line-clamp-2 text-[12.5px] text-ink-2">{r.reason}</p>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Out (planned)" value={fmtTime(r.outTime)} />
              <Metric label="Expected in" value={fmtTime(r.expectedInTime)} />
              <Metric label="Actual out" value={r.actualOutTime ? fmtStamp(r.actualOutTime) : "—"} />
              <Metric label="Actual in" value={r.actualInTime ? fmtStamp(r.actualInTime) : "—"} tone={r.late && r.actualInTime ? "danger" : undefined} />
            </div>
          </CardBody>
          {canPrint && ISSUED.includes(r.status) && (
            <CardFooter>
              <Button size="sm" variant="ghost" onClick={() => print(r)}><Icon name="print" className="h-3.5 w-3.5" /> Print pass</Button>
            </CardFooter>
          )}
        </RecordCard>
      ))}
    </CardGrid>
  );

  /** Phones: pass-record card (identity + status, chips, reason, 2×2 times panel). */
  const mobileCards = rows.length === 0 ? (
    <CardEmpty icon="door" title="No passes match" hint="Change or clear the filters." />
  ) : rows.map((r) => (
    <MCard key={r.id} tone={r.late ? "danger" : toneFor(r.student.fullName)}>
      <div className="flex items-start gap-3">
        <MAvatar name={r.student.fullName} tone={toneFor(r.student.fullName)} size={52} shape="rounded" variant="soft" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-snug text-ink">{r.student.fullName}</p>
          <p className="mt-0.5 text-[13px] text-ink-3">
            <span className="font-mono">{r.student.admissionNo}</span>{classLabel(r.student.class) && ` · ${classLabel(r.student.class)}`}
          </p>
        </div>
        <span className="shrink-0 pt-0.5"><StatusPill status={r.status} /></span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <MChip icon="user">{r.type}</MChip>
        {r.hostel && <MChip icon="home" tone="blue">{r.hostel.name} · {r.hostel.room}</MChip>}
        {r.late && <MChip icon="alert" tone="danger">Late</MChip>}
      </div>
      {r.reason && <p className="mt-3 text-[14px] text-ink-2">{r.reason}</p>}
      <div className="mt-3">
        <MPanel>
          <div className="grid grid-cols-2 divide-x divide-line">
            <MStat label="Out (planned)" icon="calendar" value={fmtTime(r.outTime)} />
            <MStat label="Expected in" icon="clock" value={r.expectedInTime ? fmtTime(r.expectedInTime) : "—"} />
          </div>
          <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
            <MStat label="Actual out" icon="clock" value={r.actualOutTime ? fmtStamp(r.actualOutTime) : "—"} />
            <MStat label="Actual in" icon="clock" value={r.actualInTime ? fmtStamp(r.actualInTime) : "—"} tone={r.late && r.actualInTime ? "danger" : undefined} />
          </div>
        </MPanel>
      </div>
      {canPrint && ISSUED.includes(r.status) && (
        <Button variant="soft" onClick={() => print(r)} className="mt-3 w-full"><Icon name="print" className="h-4 w-4" /> Print pass</Button>
      )}
    </MCard>
  ));

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          icon="filter"
          title="Filter pass records"
          subtitle="Dates match the planned out time. Pass codes and parent codes are never shown here."
        />
        <form onSubmit={apply} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="sm:col-span-2 xl:col-span-2">
            <Field label="Student">
              <Input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Name or admission no." aria-label="Search by student name or admission number" />
            </Field>
          </div>
          <MobileFilters active={[applied.status, applied.from, applied.to, applied.class_id, applied.hostel_id].filter(Boolean).length + (applied.late ? 1 : 0)} onClear={clear}>
          <Field label="Status">
            <Select aria-label="Filter by status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">Any status</option>
              {PASS_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" aria-label="Out time from" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </Field>
          <Field label="To" error={badRange ? "Before the start date" : undefined}>
            <Input type="date" aria-label="Out time to" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </Field>
          <Field label="Class">
            <Select aria-label="Filter by class" value={draft.class_id} onChange={(e) => setDraft({ ...draft, class_id: e.target.value })}>
              <option value="">All classes</option>
              {options.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </Select>
          </Field>
          <Field label="Hostel">
            <Select aria-label="Filter by hostel" value={draft.hostel_id} onChange={(e) => setDraft({ ...draft, hostel_id: e.target.value })}>
              <option value="">All (incl. day scholars)</option>
              {options.hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          {/* Phone sheet only: the late toggle and an apply button, since filters here apply on submit. */}
          <label className="flex items-center gap-2 font-medium text-ink-2 min-h-11 text-[13px] md:hidden">
            <input type="checkbox" checked={draft.late} onChange={(e) => setDraft({ ...draft, late: e.target.checked })} />
            Late returns only
          </label>
          <Button type="submit" variant="primary" disabled={badRange} className="md:!hidden">
            <Icon name="filter" className="h-4 w-4" /> Apply filters
          </Button>
          </MobileFilters>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-4 xl:col-span-7">
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2 max-md:min-h-11 max-md:text-[13px] max-md:hidden">
              <input type="checkbox" checked={draft.late} onChange={(e) => setDraft({ ...draft, late: e.target.checked })} />
              Late returns only
            </label>
            <div className="flex flex-wrap items-center gap-2 max-md:w-full">
              <Button type="button" variant="ghost" onClick={clear} disabled={!active && !dirty} className="max-md:flex-1">
                <Icon name="x" className="h-4 w-4" /> Clear
              </Button>
              <Button type="submit" variant="primary" disabled={badRange} className="max-md:flex-1">
                <Icon name="filter" className="h-4 w-4" /> Apply filters
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <Card className="max-md:contents">
        <CardHead
          icon="clipboard"
          title="Pass records"
          subtitle={loading
            ? "Loading…"
            : `${data?.total ?? 0} pass${data?.total === 1 ? "" : "es"}${active ? " match the filters" : " in total"}${lateCount ? ` · ${lateCount} late` : ""}${data?.truncated ? " · showing the first 2,000 — narrow the dates" : ""}`}
          actions={
            <Button variant="soft" onClick={exportCsv} loading={exporting} disabled={loading || !rows.length}>
              <Icon name="download" className="h-4 w-4" /> Export CSV
            </Button>
          }
        />
        <TableView id="gate-records" title="Student" badge="Status" cards={cards} mobileCards={loading ? undefined : mobileCards}>
          <div className="table-wrap">
            <table className="data-table min-w-[1180px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th aria-sort={sort === "asc" ? "ascending" : "descending"}>
                    <button
                      type="button"
                      onClick={() => setSort((s) => (s === "asc" ? "desc" : "asc"))}
                      className="inline-flex items-center gap-1 uppercase hover:text-ink"
                      aria-label={`Out time, sorted ${sort === "asc" ? "oldest" : "newest"} first — click to reverse`}
                    >
                      Out
                      <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${sort === "asc" ? "rotate-180" : ""}`} />
                    </button>
                  </th>
                  <th>Expected in</th>
                  <th>Actual out</th>
                  <th>Actual in</th>
                  <th>Status</th>
                  <th>Late</th>
                  <th className="th-end">Actions</th>
                </tr>
              </thead>
              {loading ? <SkeletonRows rows={6} cols={11} /> : (
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="min-w-[13rem]">
                        <p className="font-semibold text-ink">{r.student.fullName}</p>
                        <p className="text-[11.5px] text-ink-3"><span className="font-mono">{r.student.admissionNo}</span>{r.hostel ? ` · ${r.hostel.name} ${r.hostel.room}` : ""}</p>
                      </td>
                      <td className="whitespace-nowrap">{classLabel(r.student.class) || "—"}</td>
                      <td className="whitespace-nowrap">{r.type}</td>
                      <td className="max-w-[16rem]">
                        <span className="line-clamp-2 text-[12.5px] text-ink-2" title={r.reason}>{r.reason}</span>
                        {r.status === "Rejected" && r.rejectedReason && <span className="block text-[11.5px] text-danger">Rejected: {r.rejectedReason}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap">{fmtTime(r.outTime)}</td>
                      <td className="tnum whitespace-nowrap">{fmtTime(r.expectedInTime)}</td>
                      <td className="tnum whitespace-nowrap" title={r.checkedOutByName ? `by ${r.checkedOutByName}` : undefined}>{r.actualOutTime ? fmtStamp(r.actualOutTime) : "—"}</td>
                      <td className="tnum whitespace-nowrap" title={r.checkedInByName ? `by ${r.checkedInByName}` : undefined}>{r.actualInTime ? fmtStamp(r.actualInTime) : "—"}</td>
                      <td className="whitespace-nowrap"><Badge tone={statusBadge(r.status)}>{r.status}</Badge></td>
                      <td>{r.late ? <Badge tone="rose">Late</Badge> : <span className="text-ink-3">—</span>}</td>
                      <td className="td-end">
                        {canPrint && ISSUED.includes(r.status)
                          ? <IconButton name="print" label={`Print pass for ${r.student.fullName}`} variant="ghost" onClick={() => print(r)} />
                          : <span className="text-ink-3">—</span>}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11}>
                        <EmptyState icon="door" title={active ? "No passes match these filters" : "No gate passes yet"} hint={active ? "Change or clear the filters." : undefined} />
                      </td>
                    </tr>
                  )}
                </tbody>
              )}
            </table>
          </div>
        </TableView>
      </Card>
    </div>
  );
}
