"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, EmptyState, Field, Icon, IconButton, Input, Modal, Select, Skeleton, Textarea } from "@/components/ui";
import { confirmAction } from "@/components/confirm";
import { FIELD_TYPES, STATUS_TONE, TemplateField, TemplateSummary, currentAcademicYear, fmtDateTime, post, shiftYear } from "./shared";

type Draft = { label: string; field_type: string; is_required: boolean; validation_rule: string };
const emptyDraft = (): Draft => ({ label: "", field_type: "text", is_required: true, validation_rule: "" });

const FIELD_TYPE_META: Record<string, { title: string; subtitle: string; icon: string; badge: string }> = {
  text: { title: "Short answer", subtitle: "Single-line text (names, IDs, city)", icon: "type", badge: "Short text" },
  textarea: { title: "Paragraph", subtitle: "Multi-line answer (address, medical notes)", icon: "alignLeft", badge: "Long text" },
  select: { title: "Multiple choice / Dropdown", subtitle: "Choose one option from a list", icon: "list", badge: "Choices" },
  number: { title: "Number", subtitle: "Numeric values (age, marks, income)", icon: "hash", badge: "Numeric" },
  date: { title: "Date", subtitle: "Calendar date picker (DOB, issue date)", icon: "calendar", badge: "Date" },
  email: { title: "Email address", subtitle: "Validated email format", icon: "mail", badge: "Email" },
  phone: { title: "Phone number", subtitle: "10-digit mobile / emergency contact", icon: "phone", badge: "Phone" },
};

const QUESTION_PRESETS: { label: string; field_type: string; is_required: boolean; validation_rule: string }[] = [
  { label: "Student Full Name", field_type: "text", is_required: true, validation_rule: "" },
  { label: "Date of Birth", field_type: "date", is_required: true, validation_rule: "" },
  { label: "Gender", field_type: "select", is_required: true, validation_rule: "^(Male|Female|Other)$" },
  { label: "Blood Group", field_type: "select", is_required: false, validation_rule: "^(A\\+|A-|B\\+|B-|O\\+|O-|AB\\+|AB-)$" },
  { label: "Category", field_type: "select", is_required: true, validation_rule: "^(General|OBC|SC|ST|EWS|Defence)$" },
  { label: "Student Aadhaar Number", field_type: "text", is_required: false, validation_rule: "^\\d{12}$" },
  { label: "Father Name", field_type: "text", is_required: true, validation_rule: "" },
  { label: "Mother Name", field_type: "text", is_required: true, validation_rule: "" },
  { label: "Guardian Mobile Number", field_type: "phone", is_required: true, validation_rule: "^\\d{10}$" },
  { label: "Residential Address", field_type: "textarea", is_required: true, validation_rule: "" },
  { label: "Previous School Name", field_type: "text", is_required: false, validation_rule: "" },
];

const SELECT_OPTION_PRESETS: { name: string; options: string[] }[] = [
  { name: "Gender", options: ["Male", "Female", "Other"] },
  { name: "Blood Group", options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
  { name: "Category", options: ["General", "OBC", "SC", "ST", "EWS", "Defence"] },
  { name: "Board", options: ["CBSE", "ICSE", "State Board", "IB", "Other"] },
  { name: "Hostel / Day Scholar", options: ["Hosteller", "Day Scholar"] },
];

const VALIDATION_PRESETS: { label: string; rule: string; hint: string }[] = [
  { label: "No pattern restriction", rule: "", hint: "Any valid input for this type" },
  { label: "10-digit Mobile", rule: "^\\d{10}$", hint: "Exactly 10 digits" },
  { label: "12-digit Aadhaar", rule: "^\\d{12}$", hint: "Exactly 12 digits" },
  { label: "6-digit PIN Code", rule: "^\\d{6}$", hint: "Indian postal PIN" },
  { label: "Letters & spaces only", rule: "^[A-Za-z .'-]{2,80}$", hint: "Alphabetic name" },
];

function parseSelectOptions(rule: string | null | undefined): string[] {
  if (!rule) return [];
  const inner = rule.replace(/^\^\(?|\)?\$$/g, "");
  if (!inner.includes("|") && !inner.trim()) return [];
  return inner
    .split("|")
    .map((s) => s.replace(/\\\+/g, "+").trim())
    .filter(Boolean);
}

function buildSelectRule(options: string[]): string {
  const clean = options.map((o) => o.trim()).filter(Boolean);
  if (!clean.length) return "";
  const escaped = clean.map((o) => o.replace(/[.*+?^${}()[\]\\]/g, "\\$&"));
  return `^(${escaped.join("|")})$`;
}

/**
 * AO: Google Forms-style per-academic-year admission form template builder.
 * Supports visual field-type cards, 1-click question bank presets, interactive choice builder
 * for dropdown/multiple-choice fields, live question cards, and comprehensive filters.
 */
export function TemplateBuilder({ notify }: { notify: (msg: string, tone?: "success" | "error") => void }) {
  const [year, setYear] = useState(currentAcademicYear());
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [choiceInput, setChoiceInput] = useState("");
  const [editing, setEditing] = useState<TemplateField | null>(null);
  const [editChoiceInput, setEditChoiceInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Filter & view state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [reqFilter, setReqFilter] = useState<"all" | "required" | "optional">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const load = useCallback(async (y: string) => {
    setLoading(true);
    try {
      const [fs, ts] = await Promise.all([
        apiFetch<TemplateField[]>(`/api/admissions/fields?academic_year=${encodeURIComponent(y)}`),
        apiFetch<TemplateSummary[]>("/api/admissions/templates"),
      ]);
      setFields(fs);
      setTemplates(ts);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load template", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void load(year); }, [year, load]);

  const summary = templates.find((t) => t.academic_year === year);
  const status = summary?.status ?? "Draft";
  const editable = fields.length === 0 || status === "Draft" || status === "Rejected";

  const draftChoices = useMemo(() => parseSelectOptions(draft.validation_rule), [draft.validation_rule]);
  const editingChoices = useMemo(() => parseSelectOptions(editing?.validationRule), [editing?.validationRule]);

  const filteredFields = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fields.filter((f) => {
      if (q && !f.label.toLowerCase().includes(q) && !f.fieldType.toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && f.fieldType !== typeFilter) return false;
      if (reqFilter === "required" && !f.isRequired) return false;
      if (reqFilter === "optional" && f.isRequired) return false;
      return true;
    });
  }, [fields, searchQuery, typeFilter, reqFilter]);

  const addDraftChoice = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = Array.from(new Set([...draftChoices, ...parts]));
    setDraft((d) => ({ ...d, validation_rule: buildSelectRule(next) }));
    setChoiceInput("");
  };

  const removeDraftChoice = (opt: string) => {
    const next = draftChoices.filter((c) => c !== opt);
    setDraft((d) => ({ ...d, validation_rule: buildSelectRule(next) }));
  };

  const addEditChoice = (raw: string) => {
    if (!editing) return;
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = Array.from(new Set([...editingChoices, ...parts]));
    setEditing({ ...editing, validationRule: buildSelectRule(next) });
    setEditChoiceInput("");
  };

  const removeEditChoice = (opt: string) => {
    if (!editing) return;
    const next = editingChoices.filter((c) => c !== opt);
    setEditing({ ...editing, validationRule: buildSelectRule(next) });
  };

  const addField = async (override?: Draft) => {
    const target = override ?? draft;
    if (!target.label.trim()) return notify("Question title is required", "error");
    if (target.field_type === "select" && parseSelectOptions(target.validation_rule).length < 2) {
      return notify("Add at least 2 options for a multiple-choice / dropdown question", "error");
    }
    setBusy(true);
    try {
      await post("/api/admissions/fields", {
        label: target.label.trim(),
        field_type: target.field_type,
        is_required: target.is_required,
        academic_year: year,
        ...(target.validation_rule.trim() ? { validation_rule: target.validation_rule.trim() } : {}),
      });
      if (!override) {
        setDraft(emptyDraft());
        setChoiceInput("");
      }
      notify(`Added "${target.label.trim()}" to ${year} form`);
      await load(year);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to add field", "error");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editing.fieldType === "select" && parseSelectOptions(editing.validationRule).length < 2) {
      return notify("Add at least 2 options for a multiple-choice / dropdown question", "error");
    }
    setBusy(true);
    try {
      await apiFetch(`/api/admissions/fields/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          label: editing.label.trim(),
          field_type: editing.fieldType,
          is_required: editing.isRequired,
          validation_rule: editing.validationRule ?? "",
        }),
      });
      setEditing(null);
      notify("Question updated");
      await load(year);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const quickToggleRequired = async (f: TemplateField) => {
    try {
      await apiFetch(`/api/admissions/fields/${f.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_required: !f.isRequired }),
      });
      setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, isRequired: !x.isRequired } : x)));
      notify(`Marked "${f.label}" as ${!f.isRequired ? "required" : "optional"}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not update field", "error");
    }
  };

  const remove = async (f: TemplateField) => {
    const ok = await confirmAction({
      title: `Remove "${f.label}"?`,
      text: `This removes the question from the ${year} admission form template.`,
      confirmText: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admissions/fields/${f.id}`, { method: "DELETE" });
      notify("Question deleted");
      await load(year);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...fields];
    const [item] = next.splice(idx, 1);
    next.splice(idx + dir, 0, item);
    setFields(next);
    try {
      await post("/api/admissions/fields/reorder", { academic_year: year, ids: next.map((f) => f.id) });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Reorder failed", "error");
      await load(year);
    }
  };

  const sendForApproval = async () => {
    const ok = await confirmAction({
      title: `Send the ${year} form template to the OS?`,
      text: `${fields.length} question${fields.length === 1 ? "" : "s"} will be locked until the Office Superintendent reviews them.`,
      confirmText: "Send for approval",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await post(`/api/admissions/templates/${encodeURIComponent(year)}/send`);
      notify("Template sent to the Office Superintendent for approval");
      await load(year);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Send failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const copyFrom = async (fromYear: string) => {
    setBusy(true);
    try {
      const r = await post<{ copied: number }>(`/api/admissions/templates/${encodeURIComponent(year)}/copy`, { from_year: fromYear });
      notify(`Copied ${r.copied} questions from ${fromYear}`);
      await load(year);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Copy failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const years = Array.from(new Set([
    shiftYear(currentAcademicYear(), -1),
    currentAcademicYear(),
    shiftYear(currentAcademicYear(), 1),
    ...templates.map((t) => t.academic_year),
  ])).sort().reverse();

  const existingKeys = new Set(fields.map((f) => f.label.toLowerCase().replace(/[^a-z0-9]/g, "")));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Google Forms-style Top Header Card */}
      <div className="card overflow-hidden border-t-[8px] border-t-brand-700 p-6 shadow-sm max-md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wider text-brand-700">
                <Icon name="admissions" className="h-3.5 w-3.5" /> Google Forms-Style Admission Builder
              </span>
              {fields.length > 0 && <Badge tone={STATUS_TONE[status] ?? "slate"}>{status}</Badge>}
            </div>
            <h2 className="font-display text-[22px] font-extrabold tracking-tight text-ink">
              Admission Application Form — {year}
            </h2>
            <p className="text-[13px] text-ink-3">
              Design the questions parents fill online or in the Parent Portal. Questions marked with <span className="font-bold text-danger">*</span> are mandatory.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2.5 max-md:w-full">
            <Field label="Academic year">
              <Select aria-label="Academic year" value={year} onChange={(e) => setYear(e.target.value)} className="w-36 font-semibold">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
            {editable && fields.length > 0 && (
              <Button variant="primary" loading={busy} onClick={sendForApproval}>
                <Icon name="check" className="h-4 w-4" /> Send to OS for approval
              </Button>
            )}
            {!editable && (
              <Button variant="soft" onClick={() => setYear(shiftYear(year, 1))}>
                Prepare {shiftYear(year, 1)} template →
              </Button>
            )}
          </div>
        </div>

        {/* Summary pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5 text-[12px] text-ink-2">
          <span className="rounded-lg bg-surface-2 px-2.5 py-1 font-semibold">
            <b>{fields.length}</b> Total questions
          </span>
          <span className="rounded-lg bg-danger-soft/60 px-2.5 py-1 font-semibold text-danger-ink">
            <b>{fields.filter((f) => f.isRequired).length}</b> Required
          </span>
          <span className="rounded-lg bg-surface-2 px-2.5 py-1 font-semibold">
            <b>{fields.filter((f) => !f.isRequired).length}</b> Optional
          </span>
          <span className="rounded-lg bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">
            <b>{fields.filter((f) => f.fieldType === "select").length}</b> Multiple-choice / Dropdown
          </span>
        </div>

        {status === "Rejected" && summary?.review_remarks && (
          <div className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink">
            <b>Sent back by the Office Superintendent:</b> {summary.review_remarks}
            {summary.reviewed_at && <span className="ml-2 text-xs opacity-75">({fmtDateTime(summary.reviewed_at)})</span>}
          </div>
        )}
        {!editable && (
          <div className="mt-4 rounded-xl bg-surface-2 px-4 py-2.5 text-[13px] text-ink-2">
            This template is <b>{status}</b> and locked against edits so submitted applications stay consistent.
          </div>
        )}
      </div>

      {/* Question Composer Card (Google Forms "Add Question" Deck) */}
      {editable && (
        <div className="card relative overflow-hidden border-l-4 border-l-brand-700 p-6 shadow-sm max-md:p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-[16px] font-bold text-ink">Add a New Question</h3>
              <p className="text-[12.5px] text-ink-3">Choose a question type below or click a 1-click preset to build your form quickly.</p>
            </div>
            <Badge tone="brand">Question #{fields.length + 1}</Badge>
          </div>

          {/* 1-Click Preset Bank */}
          <div className="mb-5 rounded-xl border border-line bg-surface-2/60 p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
              <Icon name="sparkles" className="h-3.5 w-3.5 text-brand-600" /> 1-Click Standard School Questions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUESTION_PRESETS.map((p) => {
                const exists = existingKeys.has(p.label.toLowerCase().replace(/[^a-z0-9]/g, ""));
                return (
                  <button
                    key={p.label}
                    type="button"
                    disabled={exists || busy}
                    onClick={() => void addField(p)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-all ${
                      exists
                        ? "cursor-not-allowed border-line bg-surface-2 text-ink-3 opacity-50"
                        : "border-brand-200 bg-surface text-brand-700 hover:border-brand-500 hover:bg-brand-50 hover:shadow-2xs"
                    }`}
                  >
                    <Icon name={exists ? "check" : "plus"} className="h-3 w-3" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 1: Visual Field Type Selector Grid */}
          <div className="mb-5">
            <span className="label mb-2 block">1. Select Question Type</span>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {FIELD_TYPES.map((t) => {
                const meta = FIELD_TYPE_META[t] ?? { title: t, subtitle: "Input field", icon: "spark", badge: t };
                const active = draft.field_type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft({ ...draft, field_type: t, validation_rule: t === "select" ? draft.validation_rule : "" })}
                    className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                      active
                        ? "border-brand-600 bg-brand-50/70 ring-2 ring-brand-500/20 shadow-xs"
                        : "border-line bg-surface hover:border-brand-300 hover:bg-surface-2/60"
                    }`}
                  >
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
                      active ? "bg-brand-700 text-white" : "bg-surface-2 text-ink-2 group-hover:bg-brand-50 group-hover:text-brand-700"
                    }`}>
                      <Icon name={meta.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-bold leading-snug ${active ? "text-brand-800" : "text-ink"}`}>{meta.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-ink-3">{meta.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Question Title & Options / Validation */}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Field label="2. Question Title" required hint="Shown as the question heading on the parent admission form.">
              <Input
                value={draft.label}
                maxLength={120}
                placeholder="e.g. Student Full Name, Blood Group, Father's Occupation…"
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                className="text-[14px] font-medium"
              />
            </Field>

            {/* Required switch + Add button */}
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={draft.is_required}
                  onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })}
                  className="h-4 w-4 rounded border-line text-brand-700"
                />
                <div>
                  <span className="block text-[13px] font-bold text-ink">Required Question</span>
                  <span className="block text-[11.5px] text-ink-3">Parents must answer before submitting</span>
                </div>
              </label>

              <Button variant="primary" loading={busy} onClick={() => void addField()}>
                <Icon name="plus" className="h-4 w-4" /> Add Question
              </Button>
            </div>
          </div>

          {/* Step 3: Interactive Option Builder for Select OR Validation Presets for other types */}
          {draft.field_type === "select" ? (
            <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-bold text-ink">3. Multiple-Choice / Dropdown Options</p>
                  <p className="text-[11.5px] text-ink-3">Add each option parents can choose from (comma-separated or one by one).</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-ink-3">Quick fill:</span>
                  {SELECT_OPTION_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, validation_rule: buildSelectRule(p.options) }))}
                      className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  value={choiceInput}
                  placeholder="Type an option (or comma-separated list like Male, Female, Other) and press Enter…"
                  onChange={(e) => setChoiceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDraftChoice(choiceInput);
                    }
                  }}
                />
                <Button variant="soft" type="button" onClick={() => addDraftChoice(choiceInput)}>
                  <Icon name="plus" className="h-4 w-4" /> Add Option
                </Button>
              </div>

              {draftChoices.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {draftChoices.map((opt, idx) => (
                    <div key={opt} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px]">
                      <span className="flex items-center gap-2.5 font-medium text-ink">
                        <span className="grid h-4 w-4 place-items-center rounded-full border border-brand-500 text-[10px] font-bold text-brand-700">
                          {idx + 1}
                        </span>
                        {opt}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDraftChoice(opt)}
                        className="text-ink-3 hover:text-danger"
                        aria-label={`Remove option ${opt}`}
                      >
                        <Icon name="x" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2.5 text-[12px] text-warn-ink">No options added yet — add at least 2 options above.</p>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-surface-2/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-ink-2">Optional format validation (Regex or preset):</span>
                <div className="flex flex-wrap gap-1.5">
                  {VALIDATION_PRESETS.map((vp) => (
                    <button
                      key={vp.label}
                      type="button"
                      onClick={() => setDraft({ ...draft, validation_rule: vp.rule })}
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                        draft.validation_rule === vp.rule
                          ? "border-brand-600 bg-brand-700 text-white"
                          : "border-line bg-surface text-ink-2 hover:border-brand-300"
                      }`}
                    >
                      {vp.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2">
                <Input
                  value={draft.validation_rule}
                  placeholder="Optional regex rule (e.g. ^\d{12}$ for 12-digit Aadhaar)"
                  onChange={(e) => setDraft({ ...draft, validation_rule: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter Bar for Template Questions */}
      {fields.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <div className="relative min-w-[14rem] flex-1">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions by title or type…"
                className="pl-9"
              />
            </div>
            <Select aria-label="Filter by question type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-44">
              <option value="all">All question types ({fields.length})</option>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_META[t]?.title ?? t}</option>
              ))}
            </Select>
            <Select aria-label="Filter by requirement" value={reqFilter} onChange={(e) => setReqFilter(e.target.value as "all" | "required" | "optional")} className="w-40">
              <option value="all">All (Req &amp; Opt)</option>
              <option value="required">Required only</option>
              <option value="optional">Optional only</option>
            </Select>
            {(searchQuery || typeFilter !== "all" || reqFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setTypeFilter("all"); setReqFilter("all"); }}>
                Reset filters
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === "cards" ? "bg-brand-700 text-white shadow-2xs" : "text-ink-2 hover:text-ink"
              }`}
            >
              <Icon name="grid" className="h-3.5 w-3.5" /> Form Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === "table" ? "bg-brand-700 text-white shadow-2xs" : "text-ink-2 hover:text-ink"
              }`}
            >
              <Icon name="list" className="h-3.5 w-3.5" /> Compact Table
            </button>
          </div>
        </div>
      )}

      {/* Questions List */}
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      ) : fields.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="admissions"
            title={`No questions in the ${year} form yet`}
            hint="Click any 1-Click Standard Question above, build a custom question, or copy last year's form."
            action={
              templates.some((t) => t.academic_year !== year) && (
                <div className="flex flex-wrap justify-center gap-2">
                  {templates.filter((t) => t.academic_year !== year).slice(0, 3).map((t) => (
                    <Button key={t.academic_year} variant="soft" onClick={() => copyFrom(t.academic_year)}>
                      <Icon name="copy" className="h-4 w-4" /> Copy {t.field_count} questions from {t.academic_year}
                    </Button>
                  ))}
                </div>
              )
            }
          />
        </div>
      ) : filteredFields.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="search"
            title="No questions match your filter"
            hint="Try clearing the search box or switching the question type filter."
            action={<Button variant="soft" onClick={() => { setSearchQuery(""); setTypeFilter("all"); setReqFilter("all"); }}>Show all {fields.length} questions</Button>}
          />
        </div>
      ) : viewMode === "cards" ? (
        <div className="space-y-3.5">
          {filteredFields.map((f) => {
            const idx = fields.findIndex((x) => x.id === f.id);
            const meta = FIELD_TYPE_META[f.fieldType] ?? { title: f.fieldType, subtitle: "", icon: "spark", badge: f.fieldType };
            const opts = f.fieldType === "select" ? parseSelectOptions(f.validationRule) : [];

            return (
              <div
                key={f.id}
                className="card group relative overflow-hidden border-l-4 border-l-brand-600 p-5 transition-all hover:shadow-md max-md:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-extrabold text-brand-700">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-display text-[15.5px] font-bold text-ink">
                        {f.label}
                        {f.isRequired && <span className="ml-1 text-danger" title="Required question">*</span>}
                      </h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge tone="sky">
                          <Icon name={meta.icon} className="mr-1 inline h-3 w-3" />
                          {meta.title}
                        </Badge>
                        <Badge tone={f.isRequired ? "amber" : "slate"}>{f.isRequired ? "Required" : "Optional"}</Badge>
                        {f.validationRule && f.fieldType !== "select" && (
                          <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-3">
                            Pattern: {f.validationRule}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {editable && (
                    <div className="flex items-center gap-1">
                      <label className="mr-2 flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-2/70 px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 hover:bg-surface">
                        <input
                          type="checkbox"
                          checked={f.isRequired}
                          onChange={() => void quickToggleRequired(f)}
                          className="h-3.5 w-3.5 rounded border-line text-brand-700"
                        />
                        Required
                      </label>
                      <IconButton name="arrowUp" label={`Move ${f.label} up`} variant="ghost" disabled={idx === 0} onClick={() => move(idx, -1)} />
                      <IconButton name="arrowDown" label={`Move ${f.label} down`} variant="ghost" disabled={idx === fields.length - 1} onClick={() => move(idx, 1)} />
                      <IconButton name="edit" label={`Edit ${f.label}`} variant="ghost" onClick={() => { setEditing(f); setEditChoiceInput(""); }} />
                      <IconButton name="trash" label={`Delete ${f.label}`} variant="ghost" onClick={() => remove(f)} />
                    </div>
                  )}
                </div>

                {/* Google Forms-style visual preview of the answer area */}
                <div className="mt-4 pl-10 max-md:pl-0">
                  {f.fieldType === "select" && opts.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {opts.map((o) => (
                        <div key={o} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-[13px] text-ink-2">
                          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-ink-3/60" />
                          <span className="truncate font-medium">{o}</span>
                        </div>
                      ))}
                    </div>
                  ) : f.fieldType === "textarea" ? (
                    <div className="rounded-xl border border-dashed border-line bg-surface-2/30 px-3.5 py-3 text-[12.5px] text-ink-3">
                      Long answer text (multi-line paragraph response)…
                    </div>
                  ) : (
                    <div className="max-w-md border-b border-dashed border-ink-3/40 pb-1.5 text-[12.5px] text-ink-3">
                      {f.fieldType === "date" ? "DD / MM / YYYY" : f.fieldType === "number" ? "Numeric answer…" : f.fieldType === "email" ? "name@example.com" : f.fieldType === "phone" ? "10-digit mobile number…" : "Short answer text…"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="w-10 px-3 py-2">#</th>
                <th className="px-3 py-2">Question Label</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Required</th>
                <th className="px-3 py-2">Options / Validation</th>
                {editable && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredFields.map((f) => {
                const idx = fields.findIndex((x) => x.id === f.id);
                const opts = f.fieldType === "select" ? parseSelectOptions(f.validationRule) : [];
                return (
                  <tr key={f.id} className="border-t border-line">
                    <td className="px-3 py-2.5 text-ink-3">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink">{f.label}</td>
                    <td className="px-3 py-2.5"><Badge tone="sky">{FIELD_TYPE_META[f.fieldType]?.title ?? f.fieldType}</Badge></td>
                    <td className="px-3 py-2.5"><Badge tone={f.isRequired ? "emerald" : "slate"}>{f.isRequired ? "Required" : "Optional"}</Badge></td>
                    <td className="px-3 py-2.5 text-xs text-ink-3">
                      {opts.length > 0 ? opts.join(", ") : <span className="font-mono">{f.validationRule ?? "—"}</span>}
                    </td>
                    {editable && (
                      <td className="px-3 py-2.5 text-right">
                        <span className="inline-flex gap-1">
                          <IconButton name="arrowUp" label={`Move ${f.label} up`} variant="ghost" disabled={idx === 0} onClick={() => move(idx, -1)} />
                          <IconButton name="arrowDown" label={`Move ${f.label} down`} variant="ghost" disabled={idx === fields.length - 1} onClick={() => move(idx, 1)} />
                          <IconButton name="edit" label={`Edit ${f.label}`} variant="ghost" onClick={() => { setEditing(f); setEditChoiceInput(""); }} />
                          <IconButton name="trash" label={`Delete ${f.label}`} variant="ghost" onClick={() => remove(f)} />
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Question Modal */}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="Edit Question"
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={saveEdit}>Save changes</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Question Title" required>
              <Input value={editing.label} maxLength={120} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </Field>
            <Field label="Question Type">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FIELD_TYPES.map((t) => {
                  const meta = FIELD_TYPE_META[t] ?? { title: t, icon: "spark" };
                  const active = editing.fieldType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditing({ ...editing, fieldType: t })}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all ${
                        active ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-500" : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                      }`}
                    >
                      <Icon name={meta.icon} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{meta.title}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {editing.fieldType === "select" ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-3.5">
                <p className="mb-2 text-xs font-bold text-ink">Multiple-Choice / Dropdown Options</p>
                <div className="flex gap-2">
                  <Input
                    value={editChoiceInput}
                    placeholder="Add option and press Enter…"
                    onChange={(e) => setEditChoiceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addEditChoice(editChoiceInput);
                      }
                    }}
                  />
                  <Button variant="soft" type="button" onClick={() => addEditChoice(editChoiceInput)}>Add</Button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {editingChoices.map((opt) => (
                    <span key={opt} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink">
                      {opt}
                      <button type="button" onClick={() => removeEditChoice(opt)} className="text-ink-3 hover:text-danger">
                        <Icon name="x" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <Field label="Validation regex" hint="Leave empty unless you need a custom pattern">
                <Input
                  value={editing.validationRule ?? ""}
                  onChange={(e) => setEditing({ ...editing, validationRule: e.target.value || null })}
                  className="font-mono text-xs"
                />
              </Field>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={editing.isRequired}
                onChange={(e) => setEditing({ ...editing, isRequired: e.target.checked })}
                className="h-4 w-4 rounded border-line text-brand-700"
              />
              Required question
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** OS view: approve or send back a pending form template, with search & status filters. */
export function TemplateApprovals({ notify, onChanged }: { notify: (msg: string, tone?: "success" | "error") => void; onChanged: () => void }) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [preview, setPreview] = useState<{ year: string; fields: TemplateField[] } | null>(null);
  const [rejectYear, setRejectYear] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [yearSearch, setYearSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setTemplates(await apiFetch<TemplateSummary[]>("/api/admissions/templates"));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load templates", "error");
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const filteredTemplates = useMemo(() => {
    const q = yearSearch.trim().toLowerCase();
    return templates.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !t.academic_year.toLowerCase().includes(q) && !(t.review_remarks ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, statusFilter, yearSearch]);

  const openPreview = async (year: string) => {
    try {
      const fields = await apiFetch<TemplateField[]>(`/api/admissions/fields?academic_year=${encodeURIComponent(year)}`);
      setPreview({ year, fields });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not load fields", "error");
    }
  };

  const approve = async (year: string) => {
    const ok = await confirmAction({
      title: `Approve & publish the ${year} admission form?`,
      text: "Once published, the Admission Officer can generate parent admission links and QR codes for this year.",
      confirmText: "Approve & publish",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await post(`/api/admissions/templates/${encodeURIComponent(year)}/approve`, {});
      notify(`Template for ${year} published`);
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Approve failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejectYear || !remarks.trim()) return;
    setBusy(true);
    try {
      await post(`/api/admissions/templates/${encodeURIComponent(rejectYear)}/reject`, { remarks: remarks.trim() });
      notify(`Sent ${rejectYear} template back to the Admission Officer`);
      setRejectYear(null);
      setRemarks("");
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Reject failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="relative min-w-[14rem] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={yearSearch}
            onChange={(e) => setYearSearch(e.target.value)}
            placeholder="Filter by academic year or review remarks…"
            className="pl-9"
          />
        </div>
        <Select aria-label="Template status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48">
          <option value="all">All statuses ({templates.length})</option>
          <option value="Pending Approval">Pending Approval</option>
          <option value="Published">Published</option>
          <option value="Draft">Draft</option>
          <option value="Rejected">Rejected</option>
        </Select>
      </div>

      <div className="card p-5 max-md:p-4">
        {filteredTemplates.length === 0 ? (
          <EmptyState icon="admissions" title="No form templates match" hint="The Admission Officer creates and submits each year's form template." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Academic year</th>
                  <th className="px-3 py-2">Questions</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Remarks</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((t) => (
                  <tr key={t.academic_year} className="border-t border-line">
                    <td className="px-3 py-2.5 font-semibold">{t.academic_year}</td>
                    <td className="px-3 py-2.5">{t.field_count} questions</td>
                    <td className="px-3 py-2.5"><Badge tone={STATUS_TONE[t.status] ?? "slate"}>{t.status}</Badge></td>
                    <td className="px-3 py-2.5 text-ink-3">{t.review_remarks ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openPreview(t.academic_year)}>
                          <Icon name="eye" className="h-3.5 w-3.5" /> Preview Form
                        </Button>
                        {t.status === "Pending Approval" && (
                          <>
                            <Button size="sm" variant="soft" onClick={() => { setRejectYear(t.academic_year); setRemarks(""); }}>Send back</Button>
                            <Button size="sm" variant="primary" loading={busy} onClick={() => approve(t.academic_year)}>
                              <Icon name="check" className="h-3.5 w-3.5" /> Approve &amp; Publish
                            </Button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={`Form Preview — ${preview.year}`} size="md">
          <div className="space-y-3">
            {preview.fields.map((f, i) => {
              const opts = f.fieldType === "select" ? parseSelectOptions(f.validationRule) : [];
              return (
                <div key={f.id} className="rounded-xl border border-line border-l-4 border-l-brand-600 bg-surface p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-bold text-ink">
                      {i + 1}. {f.label} {f.isRequired && <span className="text-danger">*</span>}
                    </span>
                    <span className="flex gap-1.5">
                      <Badge tone="sky">{FIELD_TYPE_META[f.fieldType]?.title ?? f.fieldType}</Badge>
                      <Badge tone={f.isRequired ? "emerald" : "slate"}>{f.isRequired ? "Required" : "Optional"}</Badge>
                    </span>
                  </div>
                  {opts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {opts.map((o) => (
                        <span key={o} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-2">
                          ○ {o}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {rejectYear && (
        <Modal
          open
          onClose={() => setRejectYear(null)}
          title={`Send ${rejectYear} template back to AO`}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejectYear(null)}>Cancel</Button>
              <Button variant="danger" loading={busy} disabled={!remarks.trim()} onClick={reject}>Send back</Button>
            </>
          }
        >
          <Field label="Reason / changes needed" required>
            <Textarea value={remarks} maxLength={1000} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
