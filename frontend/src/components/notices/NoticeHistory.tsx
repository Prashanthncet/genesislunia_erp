"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate, relativeTime } from "@/lib/format";
import { TableView } from "@/components/TableView";
import { CardBody, CardEmpty, CardFooter, CardGrid, Chip, Meter, RecordCard, StatusPill } from "@/components/RecordCard";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Select, SkeletonRows, useToast } from "@/components/ui";
import { NoticeComposer } from "./NoticeComposer";
import { AUDIENCE_LABEL, confirmAction, type NoticeTargets, type StaffNotice } from "./types";

const target = (n: StaffNotice) =>
  n.audience === "all_students" ? "All students"
    : n.audience === "class" ? `Class ${n.class_name ?? ""}`.trim()
      : `${n.student_name ?? "Student"}${n.student_admission_no ? ` · ${n.student_admission_no}` : ""}`;

/** Staff "Student notices" tab: compose + history with read counts, expire and delete. */
export function NoticeHistory() {
  const toast = useToast();
  const [rows, setRows] = useState<StaffNotice[]>([]);
  const [targets, setTargets] = useState<NoticeTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState(false);
  const [busy, setBusy] = useState("");
  const [audience, setAudience] = useState("");
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (audience) p.set("audience", audience);
      if (classId) p.set("class_id", classId);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      setRows(await apiFetch<StaffNotice[]>(`/api/notices?${p.toString()}`));
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not load notices", "error");
    } finally {
      setLoading(false);
    }
  }, [audience, classId, from, to, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    apiFetch<NoticeTargets>("/api/notices/targets").then(setTargets).catch(() => setTargets(null));
  }, []);

  const expire = async (n: StaffNotice) => {
    if (!(await confirmAction({ title: "Hide this notice?", text: `"${n.title}" will no longer show on the portal. It stays in this history.`, confirm: "Hide notice" }))) return;
    setBusy(n.id);
    try {
      await apiFetch(`/api/notices/${n.id}/expire`, { method: "POST" });
      toast.push("Notice hidden from the portal", "success");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not hide the notice", "error");
    } finally { setBusy(""); }
  };

  const remove = async (n: StaffNotice) => {
    if (!(await confirmAction({ title: "Delete this notice?", text: `"${n.title}" and its read receipts will be removed permanently.`, confirm: "Delete", danger: true }))) return;
    setBusy(n.id);
    try {
      await apiFetch(`/api/notices/${n.id}`, { method: "DELETE" });
      toast.push("Notice deleted", "success");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not delete the notice", "error");
    } finally { setBusy(""); }
  };

  const filtered = !!(audience || classId || from || to);
  const clear = () => { setAudience(""); setClassId(""); setFrom(""); setTo(""); };

  const actions = (n: StaffNotice) => n.can_manage ? (
    <div className="flex justify-end gap-1.5">
      {!n.expired && (
        <Button type="button" size="sm" variant="ghost" loading={busy === n.id} onClick={() => expire(n)} aria-label={`Hide notice ${n.title}`}>
          <Icon name="eye" className="h-3.5 w-3.5" /> Hide
        </Button>
      )}
      <Button type="button" size="sm" variant="danger" disabled={busy === n.id} onClick={() => remove(n)} aria-label={`Delete notice ${n.title}`}>
        <Icon name="trash" className="h-3.5 w-3.5" /> Delete
      </Button>
    </div>
  ) : <span className="text-[12px] text-ink-3">—</span>;

  const cards = (
    <CardGrid min="20rem" empty={<CardEmpty icon="bell" title={loading ? "Loading notices…" : "No notices yet"} hint={loading ? undefined : "Post the first one with “New notice”."} />}>
      {loading ? null : rows.map((n) => (
        <RecordCard key={n.id} rail={n.expired ? "slate" : n.priority === "important" ? "danger" : "navy"}>
          <CardBody className="!gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-semibold text-ink">{n.title}</h3>
                <p className="mt-0.5 text-[12px] text-ink-3">{target(n)}</p>
              </div>
              <StatusPill status={n.expired ? "Expired" : "Active"} tone={n.expired ? "slate" : "ok"} />
            </div>
            <p className="line-clamp-3 whitespace-pre-line text-[12.5px] text-ink-2">{n.body}</p>
            <Meter value={n.read_count} max={Math.max(1, n.audience_size)} tone="blue" label="Read by" caption={`${n.read_count} / ${n.audience_size}`} />
            <div className="flex flex-wrap gap-1.5">
              {n.priority === "important" && <Chip icon="alert" tone="danger">Important</Chip>}
              <Chip icon="calendar">{formatDate(n.created_at)}</Chip>
              {n.expires_at && !n.expired && <Chip icon="clock">Until {formatDate(n.expires_at)}</Chip>}
              {n.created_by && <Chip icon="user">{n.created_by.name}</Chip>}
            </div>
          </CardBody>
          {n.can_manage && <CardFooter>{actions(n)}</CardFooter>}
        </RecordCard>
      ))}
    </CardGrid>
  );

  return (
    <>
      <Card>
        <CardHead
          icon="bell"
          title="Student notices"
          subtitle={loading ? "Loading…" : `${rows.length} notice${rows.length === 1 ? "" : "s"}${filtered ? " (filtered)" : ""} · read counts are per login`}
          actions={
            <Button type="button" variant="primary" onClick={() => setComposer(true)}>
              <Icon name="plus" className="h-4 w-4" /> New notice
            </Button>
          }
        />
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3.5">
          <div className="w-full min-w-0 sm:w-44">
            <Field label="Audience">
              <Select value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Filter by audience">
                <option value="">All audiences</option>
                {Object.entries(AUDIENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-full min-w-0 sm:w-44">
            <Field label="Class">
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class">
                <option value="">All classes</option>
                {(targets?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-40">
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Posted from" />
            </Field>
          </div>
          <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-40">
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Posted to" />
            </Field>
          </div>
          {filtered && (
            <Button type="button" variant="ghost" onClick={clear}>
              <Icon name="x" className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>
        <TableView id="student-notices" cards={cards} badge="Status">
          <div className="table-wrap">
            <table className="data-table">
              <thead className="sticky top-0 z-[1] bg-surface-2">
                <tr>
                  <th>Notice</th>
                  <th>Sent to</th>
                  <th>Posted</th>
                  <th className="th-end">Read</th>
                  <th>Status</th>
                  <th className="th-end">Actions</th>
                </tr>
              </thead>
              {loading ? <SkeletonRows rows={4} cols={6} /> : (
                <tbody>
                  {rows.map((n) => (
                    <tr key={n.id}>
                      <td className="max-w-[22rem]">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-ink">{n.title}</span>
                          {n.priority === "important" && <Badge tone="rose">Important</Badge>}
                        </div>
                        <p className="line-clamp-1 text-[12px] text-ink-3">{n.body}</p>
                      </td>
                      <td className="whitespace-nowrap text-[13px] text-ink-2">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">{AUDIENCE_LABEL[n.audience]}</span>
                        {target(n)}
                      </td>
                      <td className="whitespace-nowrap text-[13px]">
                        <span className="tnum text-ink-2" title={new Date(n.created_at).toLocaleString("en-IN")}>{formatDate(n.created_at)}</span>
                        <span className="block text-[11.5px] text-ink-3">{n.created_by?.name ?? "—"} · {relativeTime(n.created_at)}</span>
                      </td>
                      <td className="tnum whitespace-nowrap text-right text-[13px] font-semibold text-ink">
                        {n.read_count}<span className="font-normal text-ink-3"> / {n.audience_size}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        <StatusPill status={n.expired ? "Expired" : "Active"} tone={n.expired ? "slate" : "ok"} />
                        {n.expires_at && !n.expired && <span className="block pt-0.5 text-[11px] text-ink-3">until {formatDate(n.expires_at)}</span>}
                      </td>
                      <td className="whitespace-nowrap text-right">{actions(n)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon="bell" title={filtered ? "No notices match these filters" : "No notices yet"} hint={filtered ? "Clear the filters to see every notice." : "Post the first one with “New notice”."} />
                      </td>
                    </tr>
                  )}
                </tbody>
              )}
            </table>
          </div>
        </TableView>
      </Card>
      <NoticeComposer open={composer} onClose={() => setComposer(false)} onSent={load} />
    </>
  );
}
