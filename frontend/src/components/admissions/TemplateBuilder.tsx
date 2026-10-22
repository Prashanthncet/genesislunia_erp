"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, EmptyState, Field, Icon, IconButton, Input, Select } from "@/components/ui";
import { TableView } from "@/components/TableView";
import {
  FIELD_TYPES, STATUS_TONE, TemplateField, TemplateSummary, currentAcademicYear, post, shiftYear,
} from "./shared";

type Draft = { label: string; field_type: string; is_required: boolean; validation_rule: string };
const EMPTY: Draft = { label: "", field_type: "text", is_required: true, validation_rule: "" };

/**
 * AO: build the admission form template for one academic year, send it to the OS,
 * see OS remarks when rejected. Published templates are read-only (new year = new version).
 */
export function TemplateBuilder({ notify }: { notify: (msg: string, tone?: "success" | "error") => void }) {
  const [year, setYear] = useState(currentAcademicYear());
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [summaries, setSummaries] = useState<TemplateSummary[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, s] = await Promise.all([
        apiFetch<TemplateField[]>(`/api/admissions/fields?academic_year=${year}`),
        apiFetch<TemplateSummary[]>("/api/admissions/templates"),
      ]);
      setFields(f);
      setSummaries(s);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load template", "error");
    } finally {
      setLoading(false);
    }
  }, [year, notify]);

  useEffect(() => { void load(); }, [load]);

  const summary = summaries.find((s) => s.academic_year === year);
  const status = summary?.status ?? (fields.length ? "Draft" : null);
  const editable = !status || status === "Draft" || status === "Rejected";
  const years = useMemo(() => {
    const set = new Set([shiftYear(currentAcademicYear(), -1), currentAcademicYear(), shiftYear(currentAcademicYear(), 1), ...summaries.map((s) => s.academic_year)]);
    return [...set].filter((y) => /^\d{4}-\d{2}$/.test(y)).sort().reverse();
  }, [summaries]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      notify(ok);
      await load();
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Action failed", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft.label.trim()) return notify("Field label is required", "error");
    const body = { ...draft, validation_rule: draft.validation_rule.trim() || undefined };
    const ok = editing
      ? await run(() => apiFetch(`/api/admissions/fields/${editing}`, { method: "PUT", body: JSON.stringify(body) }), "Field updated")
      : await run(() => post("/api/admissions/fields", { ...body, academic_year: year }), "Field added");
    if (ok) {
      setDraft(EMPTY);
      setEditing(null);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const ids = fields.map((f) => f.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void run(() => post("/api/admissions/fields/reorder", { academic_year: year, ids }), "Order saved");
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Academic year">
            <Select aria-label="Academic year" value={year} onChange={(e) => { setYear(e.target.value); setEditing(null); setDraft(EMPTY); }} className="w-auto">
              {years.map((y) => <option key={y}>{y}</option>)}
            </Select>
          </Field>
          <div className="flex items-center gap-2 pb-2">
            {status ? <Badge tone={STATUS_TONE[status] ?? "slate"}>{status}</Badge> : <Badge tone="slate">No template yet</Badge>}
            <span className="text-xs text-ink-3">{fields.length} field{fields.length === 1 ? "" : "s"}</span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {editable && fields.length > 0 && (
              <Button variant="accent" loading={busy} onClick={() => run(() => post(`/api/admissions/templates/${year}/send`), "Sent to the OS for approval")}>
                <Icon name="spark" className="h-4 w-4" /> Send for approval
              </Button>
            )}
          </div>
        </div>

        {status === "Rejected" && summary?.review_remarks && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger-ink">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span><b>Returned by the OS:</b> {summary.review_remarks}</span>
          </div>
        )}
        {status === "Pending Approval" && (
          <p className="mt-4 text-[13px] text-ink-3">Waiting for the Office Superintendent to approve. The template is locked meanwhile.</p>
        )}
        {status === "Published" && (
          <p className="mt-4 text-[13px] text-ink-3">
            Published — this is the form parents see for {year}. To change it, build the next year&apos;s template (copy this one as a start).
          </p>
        )}

        {editable && (
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.5fr_auto_auto]">
            <Field label={editing ? "Edit field label" : "Field label"}>
              <Input value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Aadhaar Number" />
            </Field>
            <Field label="Type">
              <Select aria-label="Field type" value={draft.field_type} onChange={(e) => setDraft({ ...draft, field_type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Validation (regex, optional)">
              <Input value={draft.validation_rule} maxLength={200} onChange={(e) => setDraft({ ...draft, validation_rule: e.target.value })} placeholder="^[0-9]{12}$" className="font-mono" />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={draft.is_required} onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })} />
              Required
            </label>
            <div className="flex items-end gap-2">
              <Button variant="primary" loading={busy} onClick={save}>
                <Icon name={editing ? "check" : "plus"} className="h-4 w-4" /> {editing ? "Save" : "Add"}
              </Button>
              {editing && <Button variant="ghost" onClick={() => { setEditing(null); setDraft(EMPTY); }}>Cancel</Button>}
            </div>
          </div>
        )}

        {fields.length === 0 && !loading && (
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <Field label="Start from an earlier year">
              <Select aria-label="Copy template from year" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="w-auto">
                <option value="">Choose year…</option>
                {summaries.filter((s) => s.academic_year !== year).map((s) => (
                  <option key={s.academic_year} value={s.academic_year}>{s.academic_year} ({s.status}, {s.field_count})</option>
                ))}
              </Select>
            </Field>
            <Button variant="soft" disabled={!copyFrom} loading={busy}
              onClick={() => run(() => post(`/api/admissions/templates/${year}/copy`, { from_year: copyFrom }), `Copied from ${copyFrom}`)}>
              <Icon name="layers" className="h-4 w-4" /> Copy fields
            </Button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <TableView id="template">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Required</th>
                <th className="px-4 py-3">Validation</th>
                <th className="px-4 py-3">Status</th>
                {editable && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.id} className="row-hover border-t border-line">
                  <td className="px-4 py-3 tnum text-ink-3">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold">{f.label}</td>
                  <td className="px-4 py-3"><Badge tone="sky">{f.fieldType}</Badge></td>
                  <td className="px-4 py-3">{f.isRequired ? <Badge tone="rose">Required</Badge> : <Badge tone="slate">Optional</Badge>}</td>
                  <td className="px-4 py-3 font-mono text-xs">{f.validationRule ?? "—"}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[f.status] ?? "slate"}>{f.status}</Badge></td>
                  {editable && (
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1">
                        <IconButton name="chevronDown" label={`Move ${f.label} down`} variant="ghost" onClick={() => move(i, 1)} />
                        <IconButton name="chevronDown" className="rotate-180" label={`Move ${f.label} up`} variant="ghost" onClick={() => move(i, -1)} />
                        <IconButton name="edit" label={`Edit ${f.label}`} variant="ghost" onClick={() => {
                          setEditing(f.id);
                          setDraft({ label: f.label, field_type: f.fieldType, is_required: f.isRequired, validation_rule: f.validationRule ?? "" });
                        }} />
                        <IconButton name="trash" label={`Delete ${f.label}`} variant="danger"
                          onClick={() => run(() => apiFetch(`/api/admissions/fields/${f.id}`, { method: "DELETE" }), "Field deleted")} />
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
        {fields.length === 0 && !loading && <EmptyState title={`No fields for ${year}`} hint="Add fields above or copy an earlier year's template." icon="clipboard" />}
      </div>
    </div>
  );
}

/** OS: approve or reject (with mandatory remarks) templates sent by the AO. */
export function TemplateApprovals({ notify }: { notify: (msg: string, tone?: "success" | "error") => void }) {
  const [summaries, setSummaries] = useState<TemplateSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummaries(await apiFetch<TemplateSummary[]>("/api/admissions/templates"));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load templates", "error");
    }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    apiFetch<TemplateField[]>(`/api/admissions/fields?academic_year=${open}`).then(setFields).catch(() => setFields([]));
  }, [open]);

  const act = async (kind: "approve" | "reject") => {
    if (!open) return;
    if (kind === "reject" && !remarks.trim()) return notify("Remarks are required to reject", "error");
    setBusy(true);
    try {
      await post(`/api/admissions/templates/${open}/${kind}`, remarks.trim() ? { remarks: remarks.trim() } : {});
      notify(kind === "approve" ? `${open} template published` : `${open} template returned to the AO`);
      setOpen(null);
      setRemarks("");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const pending = summaries.filter((s) => s.status === "Pending Approval");
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <TableView id="template-approvals">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Academic year</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Fields</th>
                <th className="px-4 py-3">Last review</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.academic_year} className="row-hover border-t border-line">
                  <td className="px-4 py-3 font-semibold">{s.academic_year}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[s.status] ?? "slate"}>{s.status}</Badge></td>
                  <td className="px-4 py-3 tnum">{s.field_count}</td>
                  <td className="px-4 py-3 text-xs text-ink-3">{s.review_remarks ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant={s.status === "Pending Approval" ? "primary" : "soft"} onClick={() => { setOpen(s.academic_year); setRemarks(""); }}>
                      {s.status === "Pending Approval" ? "Review" : "View"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
        {pending.length === 0 && <p className="px-4 py-3 text-[13px] text-ink-3">Nothing is waiting for your approval.</p>}
      </div>

      {open && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-[15px] font-bold">Template {open}</h3>
            <IconButton name="x" label="Close" variant="ghost" onClick={() => setOpen(null)} />
          </div>
          <ol className="mb-4 space-y-1.5 text-[13px]">
            {fields.map((f, i) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <span className="tnum w-5 text-ink-3">{i + 1}.</span>
                <span className="font-semibold">{f.label}</span>
                <Badge tone="sky">{f.fieldType}</Badge>
                {f.isRequired && <Badge tone="rose">Required</Badge>}
                {f.validationRule && <span className="font-mono text-xs text-ink-3">{f.validationRule}</span>}
              </li>
            ))}
          </ol>
          {summaries.find((s) => s.academic_year === open)?.status === "Pending Approval" && (
            <div className="space-y-3 border-t border-line pt-4">
              <Field label="Remarks" hint="Required when rejecting; shown to the admission officer.">
                <Input value={remarks} maxLength={1000} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button variant="primary" loading={busy} onClick={() => act("approve")}><Icon name="check" className="h-4 w-4" /> Approve &amp; publish</Button>
                <Button variant="danger" loading={busy} onClick={() => act("reject")}>Reject</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
