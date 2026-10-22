"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, EmptyState, Field, Icon, Input, Select } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { type MyDay, type SubstitutionRow, type SuggestResponse, type TtClass, type TtPeriod, errMsg } from "./types";

const STATUS_TONE: Record<string, "amber" | "emerald" | "slate"> = { Requested: "amber", Assigned: "emerald", Cancelled: "slate" };

/**
 * Substitutions for one date.
 * - Teachers (and HODs) raise cover requests for their own lessons.
 * - Timetable admins see free teachers ranked by load (with the reason every busy
 *   teacher is unavailable), assign manually or automatically, cancel, or delete.
 * The backend re-validates every assignment, so conflict messages from it are shown as-is.
 */
export function SubstitutionDesk({
  date, classes, periods, isAdmin, canRequest, onMessage,
}: {
  date: string;
  classes: TtClass[];
  periods: TtPeriod[];
  isAdmin: boolean;
  canRequest: boolean;
  onMessage: (m: string) => void;
}) {
  const [subs, setSubs] = useState<SubstitutionRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Admin: arrange cover
  const [classId, setClassId] = useState("");
  const [period, setPeriod] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [suggest, setSuggest] = useState<SuggestResponse | null>(null);
  const [busy, setBusy] = useState("");

  // Teacher: request cover
  const [myDay, setMyDay] = useState<MyDay | null>(null);
  const [reqKey, setReqKey] = useState("");
  const [reqReason, setReqReason] = useState("");

  const teaching = periods.filter((p) => !p.isBreak);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSubs(await apiFetch<SubstitutionRow[]>(`/api/timetable/substitutions?date=${date}`));
    } catch (e) {
      onMessage(errMsg(e, "Failed to load substitutions"));
    } finally {
      setLoading(false);
    }
  }, [date, onMessage]);

  useEffect(() => { void load(); setSuggest(null); }, [load]);

  useEffect(() => {
    if (!canRequest) return;
    apiFetch<MyDay>(`/api/timetable/me/today?date=${date}`).then(setMyDay).catch(() => setMyDay(null));
  }, [date, canRequest, subs]);

  const findTeachers = async (cid = classId, p = period) => {
    if (!cid || !p) return onMessage("Choose a class and period first — required");
    try {
      setSuggest(await apiFetch<SuggestResponse>(`/api/timetable/substitutions/suggest?date=${date}&class_id=${cid}&period=${p}`));
    } catch (e) {
      onMessage(errMsg(e, "Failed to load suggestions"));
    }
  };

  const pendingFor = (cid: string, p: number) =>
    subs.find((s) => s.class_id === cid && s.period_number === p && s.status === "Requested");

  const assign = async (substituteId?: string) => {
    if (!suggest) return;
    setBusy(substituteId ?? "auto");
    try {
      const pending = pendingFor(suggest.class_id, suggest.period_number);
      const res = pending
        ? await apiFetch<{ assigned_to: { name: string }; warnings: string[] }>(`/api/timetable/substitutions/${pending.id}/assign`, {
            method: "POST",
            body: JSON.stringify(substituteId ? { substitute_teacher_id: substituteId } : {}),
          })
        : await apiFetch<{ assigned_to: { name: string }; warnings: string[] }>("/api/timetable/substitute", {
            method: "POST",
            body: JSON.stringify({
              date, class_id: suggest.class_id, period_number: suggest.period_number,
              ...(substituteId ? { substitute_teacher_id: substituteId } : {}),
              ...(reason ? { reason } : {}),
            }),
          });
      onMessage(`${res.assigned_to.name} assigned — substitute e-mailed and class notice posted${res.warnings?.length ? ` (${res.warnings.join("; ")})` : ""}`);
      setSuggest(null);
      await load();
    } catch (e) {
      onMessage(errMsg(e, "Assignment failed"));
      await findTeachers(suggest.class_id, suggest.period_number);
    } finally {
      setBusy("");
    }
  };

  const cancel = async (id: string) => {
    try {
      await apiFetch(`/api/timetable/substitutions/${id}/cancel`, { method: "POST", body: "{}" });
      onMessage("Substitution cancelled");
      await load();
    } catch (e) {
      onMessage(errMsg(e, "Cancel failed"));
    }
  };
  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/timetable/substitutions/${id}`, { method: "DELETE" });
      onMessage("Substitution removed");
      await load();
    } catch (e) {
      onMessage(errMsg(e, "Delete failed"));
    }
  };

  const myLessons = (myDay?.schedule ?? []).filter((e) => e.kind === "lesson" && e.class_id);
  const request = async () => {
    const lesson = myLessons.find((l) => `${l.class_id}|${l.period_number}` === reqKey);
    if (!lesson || !reqReason.trim()) return onMessage("Pick one of your lessons and give a reason — required");
    try {
      await apiFetch("/api/timetable/substitutions/request", {
        method: "POST",
        body: JSON.stringify({ date, class_id: lesson.class_id, period_number: lesson.period_number, reason: reqReason.trim() }),
      });
      onMessage("Cover requested — an administrator will assign a substitute");
      setReqKey("");
      setReqReason("");
      await load();
    } catch (e) {
      onMessage(errMsg(e, "Request failed"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canRequest && (
          <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-ink">Request cover · {date}</h3>
            {myLessons.length === 0 ? (
              <p className="text-sm text-ink-3">You have no lessons on this date that still need cover.</p>
            ) : (
              <>
                <Field label="Your lesson" required>
                  <Select value={reqKey} onChange={(e) => setReqKey(e.target.value)}>
                    <option value="">Choose a lesson</option>
                    {myLessons.map((l) => (
                      <option key={`${l.class_id}|${l.period_number}`} value={`${l.class_id}|${l.period_number}`}>
                        P{l.period_number} · {l.subject} · {l.class_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reason" required>
                  <Input value={reqReason} maxLength={200} onChange={(e) => setReqReason(e.target.value)} placeholder="e.g. Medical appointment" />
                </Field>
                <Button variant="primary" onClick={request}><Icon name="upload" className="h-4 w-4" /> Send request</Button>
              </>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-ink">Arrange cover · {date}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Class">
                <Select value={classId} onChange={(e) => { setClassId(e.target.value); setSuggest(null); }}>
                  <option value="">Choose class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
                </Select>
              </Field>
              <Field label="Period">
                <Select value={period} onChange={(e) => { setPeriod(e.target.value ? Number(e.target.value) : ""); setSuggest(null); }}>
                  <option value="">Choose period</option>
                  {teaching.map((p) => <option key={p.periodNumber} value={p.periodNumber}>P{p.periodNumber} · {p.startTime}</option>)}
                </Select>
              </Field>
              <Field label="Reason">
                <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
            <Button variant="soft" onClick={() => findTeachers()}><Icon name="search" className="h-4 w-4" /> Find free teachers</Button>
          </div>
        )}
      </div>

      {isAdmin && suggest && (
        <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-3" style={{ animation: "fade-up 0.35s var(--ease-soft) both" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink">
                Suggestions · {classes.find((c) => c.id === suggest.class_id)?.name ?? suggest.class_id} · P{suggest.period_number}
              </h3>
              <p className="text-xs text-ink-3">
                {suggest.lesson ? `${suggest.lesson.subject} with ${suggest.lesson.teacher_name}` : "No regular lesson in this slot"}
                {pendingFor(suggest.class_id, suggest.period_number) ? " · fills the open request" : ""}
                {" · least-loaded free teachers first"}
              </p>
            </div>
            <Button variant="primary" onClick={() => assign()} loading={busy === "auto"}><Icon name="refresh" className="h-4 w-4" /> Auto-assign best</Button>
          </div>
          <ul className="divide-y divide-line">
            {suggest.candidates.map((c) => (
              <li key={c.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${c.available ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-ink-3 tnum">
                    {c.load}/{c.max_periods} periods that day{c.over_limit ? " · at daily limit" : ""}
                  </p>
                  {c.conflicts.length > 0 && <p className="text-xs text-danger-ink">{c.conflicts.join(" · ")}</p>}
                </div>
                {c.available ? (
                  <Button size="sm" variant={c.over_limit ? "soft" : "primary"} loading={busy === c.id} onClick={() => assign(c.id)}>
                    Assign
                  </Button>
                ) : (
                  <Badge tone="rose">Unavailable</Badge>
                )}
              </li>
            ))}
            {suggest.candidates.length === 0 && <li className="py-4 text-sm text-ink-3">No teachers found.</li>}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-line bg-white shadow-soft overflow-hidden">
        {subs.length === 0 ? (
          <EmptyState icon="refresh" title={loading ? "Loading…" : "No substitutions for this date"} hint={isAdmin ? "Arrange cover above, or mark a teacher absent." : "Cover requests and assignments for this date appear here."} />
        ) : (
          <div className="overflow-x-auto">
            <TableView id="subs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-2/70 border-b border-line">
                  <tr className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Class</th>
                    <th className="px-4 py-3.5">Period</th>
                    <th className="px-4 py-3.5">Original</th>
                    <th className="px-4 py-3.5">Substitute</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Reason</th>
                    {isAdmin && <th className="px-5 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-sm">
                  {subs.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-2/70">
                      <td className="px-5 py-3 font-semibold text-ink">{s.class_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-2">P{s.period_number}</td>
                      <td className="px-4 py-3 text-xs text-ink-2">{s.original_teacher_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-medium text-ink">{s.substitute_name ?? "—"}</td>
                      <td className="px-4 py-3"><Badge tone={STATUS_TONE[s.status] ?? "slate"}>{s.status}</Badge></td>
                      <td className="px-4 py-3 text-xs text-ink-2">{s.reason ?? "—"}</td>
                      {isAdmin && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {s.status === "Requested" && (
                            <Button size="sm" variant="primary" className="mr-1.5" onClick={() => { setClassId(s.class_id); setPeriod(s.period_number); void findTeachers(s.class_id, s.period_number); }}>
                              Assign…
                            </Button>
                          )}
                          {s.status !== "Cancelled" && (
                            <Button size="sm" variant="soft" className="mr-1.5" onClick={() => cancel(s.id)}>Cancel</Button>
                          )}
                          <Button size="sm" variant="danger" onClick={() => remove(s.id)} aria-label={`Delete substitution for ${s.class_name} period ${s.period_number}`}>
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableView>
          </div>
        )}
      </div>
    </div>
  );
}
