"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { confirmAction } from "@/components/confirm";
import { classLabel, errMsg, OPTION_KEYS, type CbtTest, type ClassItem, type Question, type Subject } from "./types";

function useLookups() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  useEffect(() => {
    apiFetch<Subject[]>("/api/academics/subjects").then(setSubjects).catch(() => undefined);
    apiFetch<ClassItem[]>("/api/classes").then(setClasses).catch(() => undefined);
  }, []);
  return { subjects, classes };
}

// ─── Question bank ──────────────────────────────────────────────

export function BankPanel() {
  const toast = useToast();
  const { subjects, classes } = useLookups();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filterClass, setFilterClass] = useState("");
  const [busy, setBusy] = useState(false);
  const blank = { question: "", type: "mcq", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A", marks: "1", subject_id: "", class_id: "" };
  const [f, setF] = useState(blank);

  const load = useCallback(async () => {
    try { setQuestions(await apiFetch<Question[]>(`/api/cbt/questions${filterClass ? `?class_id=${filterClass}` : ""}`)); }
    catch (e) { toast.push(errMsg(e), "error"); }
  }, [filterClass, toast]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const mcq = f.type === "mcq";
      await apiFetch("/api/cbt/questions", {
        method: "POST",
        body: JSON.stringify({
          question: f.question, type: f.type, marks: Number(f.marks),
          subject_id: f.subject_id || undefined, class_id: f.class_id || undefined,
          ...(mcq ? { option_a: f.option_a, option_b: f.option_b, option_c: f.option_c, option_d: f.option_d, correct_option: f.correct_option } : {}),
        }),
      });
      toast.push("Question added", "success");
      setF({ ...blank, class_id: f.class_id, subject_id: f.subject_id, type: f.type });
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    const q = questions.find((x) => x.id === id)?.question ?? "";
    const short = q.length > 60 ? `${q.slice(0, 57)}…` : q;
    if (!(await confirmAction({ title: "Delete this question?", text: `"${short}" will be removed from the bank. This cannot be undone.`, confirmText: "Delete", tone: "danger" }))) return;
    try { await apiFetch(`/api/cbt/questions/${id}`, { method: "DELETE" }); await load(); toast.push("Question deleted", "success"); } catch (e) { toast.push(errMsg(e), "error"); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 max-md:min-w-0">
        <CardHead title="New question" icon="plus" />
        <div className="space-y-2">
          <Select aria-label="Question type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="mcq">Multiple choice</option>
            <option value="subjective">Subjective (written)</option>
          </Select>
          <Textarea aria-label="Question" placeholder="Question text" rows={3} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
          {f.type === "mcq" && (
            <>
              {(["a", "b", "c", "d"] as const).map((k) => (
                <Input key={k} placeholder={`Option ${k.toUpperCase()}`} value={f[`option_${k}`]} onChange={(e) => setF({ ...f, [`option_${k}`]: e.target.value })} />
              ))}
              <Select aria-label="Correct option" value={f.correct_option} onChange={(e) => setF({ ...f, correct_option: e.target.value })}>
                {["A", "B", "C", "D"].map((o) => <option key={o} value={o}>Correct: {o}</option>)}
              </Select>
            </>
          )}
          <div className="flex gap-2 max-md:flex-col">
            <Select aria-label="Class" value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>
              <option value="">Any class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </Select>
            <Select aria-label="Subject" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })}>
              <option value="">Any subject</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <Field label="Marks"><Input type="number" min={0.5} step={0.5} value={f.marks} onChange={(e) => setF({ ...f, marks: e.target.value })} /></Field>
          <Button variant="primary" loading={busy} disabled={!f.question.trim()} onClick={add} className="max-md:w-full">Add to bank</Button>
        </div>
      </Card>
      <Card className="p-4 lg:col-span-2 max-md:min-w-0">
        <CardHead
          title="Question bank"
          icon="book"
          subtitle={`${questions.length} question(s)`}
          actions={
            <Select aria-label="Filter by class" className="field w-auto max-md:!w-full" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </Select>
          }
        />
        {questions.length === 0 ? <EmptyState title="No questions yet" icon="book" /> : (
          <ul className="max-h-[36rem] space-y-2 overflow-y-auto pr-1 text-sm">
            {questions.map((q) => (
              <li key={q.id} className="rounded-xl bg-surface-2/70 px-3 py-2 max-md:min-w-0">
                <div className="flex items-start justify-between gap-2 max-md:flex-col">
                  <p className="font-medium max-md:w-full max-md:min-w-0 max-md:[overflow-wrap:anywhere]">{q.question}</p>
                  <div className="flex shrink-0 items-center gap-1 max-md:w-full max-md:flex-wrap max-md:gap-2">
                    <Badge tone={q.type === "mcq" ? "sky" : "violet"}>{q.type === "mcq" ? "MCQ" : "Written"}</Badge>
                    <Badge>{q.marks} mk</Badge>
                    <Button size="sm" variant="ghost" onClick={() => remove(q.id)}>Delete</Button>
                  </div>
                </div>
                {q.type === "mcq" && (
                  <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-ink-2 max-md:grid-cols-1 max-md:gap-y-1 max-md:text-[13px]">
                    {OPTION_KEYS.map(([k, key]) => (
                      <span key={k} className={q.correctOption === k ? "font-bold text-ok-ink" : ""}>{k}. {q[key]}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Tests ──────────────────────────────────────────────────────

export function TestsPanel({ onResults }: { onResults: (testId: string) => void }) {
  const toast = useToast();
  const { subjects, classes } = useLookups();
  const [tests, setTests] = useState<CbtTest[]>([]);
  const [bank, setBank] = useState<Question[]>([]);
  const [f, setF] = useState({ title: "", class_id: "", subject_id: "", duration_min: "30", starts_at: "" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, b] = await Promise.all([apiFetch<CbtTest[]>("/api/cbt/tests"), apiFetch<Question[]>("/api/cbt/questions")]);
      setTests(t);
      setBank(b);
    } catch (e) { toast.push(errMsg(e), "error"); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!f.class_id && classes[0]) setF((x) => ({ ...x, class_id: classes[0].id })); }, [classes, f.class_id]);

  const eligible = useMemo(() => bank.filter((q) => !q.classId || q.classId === f.class_id), [bank, f.class_id]);
  const totalMarks = eligible.filter((q) => picked.has(q.id)).reduce((s, q) => s + q.marks, 0);

  const create = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/cbt/tests", {
        method: "POST",
        body: JSON.stringify({
          title: f.title, class_id: f.class_id, subject_id: f.subject_id || undefined, duration_min: Number(f.duration_min),
          starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : undefined,
          question_ids: eligible.filter((q) => picked.has(q.id)).map((q) => q.id),
        }),
      });
      toast.push("Test created as Draft", "success");
      setF({ ...f, title: "", starts_at: "" });
      setPicked(new Set());
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const act = async (id: string, action: "publish" | "complete" | "delete") => {
    const title = tests.find((x) => x.id === id)?.title ?? "this test";
    const ask = action === "publish"
      ? { title: `Publish ${title}?`, text: "Students in the class can start it as soon as it is published.", confirmText: "Publish", tone: "primary" as const }
      : action === "complete"
        ? { title: `Close ${title}?`, text: "Unfinished attempts are auto-submitted with their saved answers.", confirmText: "Close test", tone: "danger" as const }
        : { title: `Delete ${title}?`, text: "This cannot be undone.", confirmText: "Delete", tone: "danger" as const };
    if (!(await confirmAction(ask))) return;
    try {
      if (action === "delete") await apiFetch(`/api/cbt/tests/${id}`, { method: "DELETE" });
      else await apiFetch(`/api/cbt/tests/${id}/${action}`, { method: "PUT" });
      toast.push(action === "publish" ? `${title} published — students can start it` : action === "complete" ? `${title} closed` : `${title} deleted`, "success");
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); }
  };

  const cls = (id: string) => classLabel(classes.find((c) => c.id === id)) || id;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 max-md:min-w-0">
        <CardHead title="New test" icon="plus" subtitle={`${picked.size} question(s) · ${totalMarks} marks`} />
        <div className="space-y-2">
          <Input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Select aria-label="Class" value={f.class_id} onChange={(e) => { setF({ ...f, class_id: e.target.value }); setPicked(new Set()); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
          </Select>
          <Select aria-label="Subject" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })}>
            <option value="">No subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Field label="Duration (minutes)"><Input type="number" min={1} max={600} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></Field>
          <Field label="Scheduled start (optional)" hint="If set, the window closes duration minutes after this; otherwise each student gets the full duration from when they start.">
            <Input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
          </Field>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-xs max-md:max-h-72 max-md:min-w-0 max-md:overflow-x-hidden max-md:overscroll-contain">
            {eligible.map((q) => (
              <label key={q.id} className="flex items-start gap-2 max-md:min-w-0 max-md:py-1.5 max-md:text-[13px]">
                <input className="max-md:mt-0.5 max-md:h-4 max-md:w-4 max-md:shrink-0" type="checkbox" checked={picked.has(q.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(q.id); else n.delete(q.id); setPicked(n); }} />
                <span className="max-md:min-w-0 max-md:flex-1 max-md:[overflow-wrap:anywhere]">{q.question} <span className="text-ink-3 max-md:whitespace-nowrap">({q.type === "mcq" ? "MCQ" : "written"}, {q.marks})</span></span>
              </label>
            ))}
            {eligible.length === 0 && <p className="text-ink-3">No questions for this class in the bank.</p>}
          </div>
          <Button variant="primary" loading={busy} disabled={!f.title.trim() || !f.class_id || picked.size === 0} onClick={create} className="max-md:w-full">Create draft</Button>
        </div>
      </Card>
      <Card className="p-4 lg:col-span-2 max-md:min-w-0">
        <CardHead title="Tests" icon="cbt" subtitle={`${tests.length} test(s)`} />
        {tests.length === 0 ? <EmptyState title="No tests yet" icon="cbt" /> : (
          <TableView id="cbt-tests" mobileHide={["Attempts"]}>
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-3 py-2 text-left">Title</th><th className="px-3 py-2 text-left">Class</th><th className="px-3 py-2 text-left">Timing</th><th className="px-3 py-2 text-left">Attempts</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th></tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-3 py-2 font-semibold max-md:[.as-cards_&]:!pr-0 max-md:[overflow-wrap:anywhere]">{t.title}<div className="text-xs font-normal text-ink-3">{t.question_count} questions</div></td>
                    <td className="px-3 py-2">{cls(t.classId)}</td>
                    <td className="px-3 py-2 text-xs">{t.durationMin} min{t.startsAt ? ` · from ${t.startsAt.replace("T", " ").slice(0, 16)}` : " · open window"}</td>
                    <td className="tnum px-3 py-2 text-xs">{t.attempts.in_progress} live · {t.attempts.submitted} to grade · {t.attempts.graded} graded</td>
                    <td className="px-3 py-2 max-md:[.as-cards_&]:!static max-md:[.as-cards_&]:col-span-full max-md:[.as-cards_&]:!order-[-1] max-md:[.as-cards_&]:!max-w-none max-md:[.as-cards_&]:!text-left max-md:[.as-cards_&]:shrink-0"><Badge tone={t.status === "Published" ? "emerald" : t.status === "Completed" ? "slate" : "amber"}>{t.status}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {t.status === "Draft" && <Button size="sm" variant="primary" onClick={() => act(t.id, "publish")}>Publish</Button>}
                        {t.status === "Published" && <Button size="sm" onClick={() => act(t.id, "complete")}>Close</Button>}
                        {t.status !== "Draft" && <Button size="sm" onClick={() => onResults(t.id)}>Results</Button>}
                        {t.attempts.in_progress + t.attempts.submitted + t.attempts.graded === 0 && <Button size="sm" variant="ghost" onClick={() => act(t.id, "delete")}>Delete</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        )}
      </Card>
    </div>
  );
}

// ─── Grading queue ──────────────────────────────────────────────

type QueueItem = {
  attempt_id: string; test_id: string; test_title: string; student: { fullName: string; admissionNo: string };
  submitted_at: string | null; question_id: string; question: string; max_marks: number; answer: string; awarded: number | null;
};

export function GradingPanel() {
  const toast = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [showGraded, setShowGraded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await apiFetch<QueueItem[]>(`/api/cbt/grading-queue${showGraded ? "?include_graded=true" : ""}`)); }
    catch (e) { toast.push(errMsg(e), "error"); } finally { setLoading(false); }
  }, [showGraded, toast]);
  useEffect(() => { void load(); }, [load]);

  const key = (i: QueueItem) => `${i.attempt_id}:${i.question_id}`;
  const grade = async (i: QueueItem) => {
    const v = Number(marks[key(i)]);
    if (!Number.isFinite(v) || v < 0 || v > i.max_marks) return toast.push(`Marks must be 0–${i.max_marks}`, "error");
    // Only a re-grade overwrites an existing mark; first-time grading needs no confirmation.
    if (i.awarded !== null && !(await confirmAction({ title: `Change ${i.student.fullName}'s mark?`, text: `${i.test_title}: ${i.awarded}/${i.max_marks} becomes ${v}/${i.max_marks}.`, confirmText: "Update mark", tone: "primary" }))) return;
    try {
      const r = await apiFetch<{ score: number; max_score: number; status: string }>(`/api/cbt/attempts/${i.attempt_id}/grade`, {
        method: "PUT", body: JSON.stringify({ question_id: i.question_id, marks: v }),
      });
      toast.push(`Saved · ${i.student.fullName} now ${r.score}/${r.max_score}${r.status === "Graded" ? " (fully graded)" : ""}`, "success");
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); }
  };

  return (
    <Card className="p-4">
      <CardHead
        title="Grading queue"
        icon="edit"
        subtitle={`${items.filter((i) => i.awarded === null).length} written answer(s) awaiting marks`}
        actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showGraded} onChange={(e) => setShowGraded(e.target.checked)} /> Include graded</label>}
      />
      {loading ? <p className="py-6 text-center text-sm text-ink-3">Loading…</p> : items.length === 0 ? <EmptyState title="Nothing to grade" icon="check" /> : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={key(i)} className="rounded-xl border border-line bg-surface-2/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                <span className="max-md:min-w-0 max-md:text-[13px]"><b className="text-ink">{i.student.fullName}</b> ({i.student.admissionNo}) · {i.test_title}</span>
                {i.awarded !== null && <Badge tone="emerald">Awarded {i.awarded}/{i.max_marks}</Badge>}
              </div>
              <p className="mt-1 text-sm font-medium">{i.question}</p>
              <blockquote className="mt-2 whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-sm text-ink-2 max-md:[overflow-wrap:anywhere]">{i.answer}</blockquote>
              <div className="mt-2 flex items-center gap-2 max-md:flex-wrap">
                <Input aria-label={`Marks for ${i.student.fullName}`} type="number" min={0} max={i.max_marks} step={0.5} className="field w-24 max-md:!w-28"
                  placeholder={`0–${i.max_marks}`} value={marks[key(i)] ?? (i.awarded ?? "").toString()} onChange={(e) => setMarks({ ...marks, [key(i)]: e.target.value })} />
                <span className="text-xs text-ink-3">/ {i.max_marks}</span>
                <Button size="sm" variant="primary" onClick={() => grade(i)} className="max-md:flex-1">Save marks</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Results (teacher) ──────────────────────────────────────────

type ResultRow = {
  attempt_id: string; student: { fullName: string; admissionNo: string }; status: string; score: number | null; max_score: number | null;
  pct: number | null; submitted_at: string | null; auto_submitted: boolean; answers: Record<string, string>; grades: Record<string, number>;
};

export function ResultsPanel({ initialTest }: { initialTest?: string }) {
  const toast = useToast();
  const [tests, setTests] = useState<CbtTest[]>([]);
  const [testId, setTestId] = useState(initialTest ?? "");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [paper, setPaper] = useState<Question[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CbtTest[]>("/api/cbt/tests").then((t) => {
      const list = t.filter((x) => x.status !== "Draft");
      setTests(list);
      setTestId((cur) => cur || list[0]?.id || "");
    }).catch((e) => toast.push(errMsg(e), "error"));
  }, [toast]);

  useEffect(() => {
    if (!testId) return;
    Promise.all([
      apiFetch<ResultRow[]>(`/api/cbt/tests/${testId}/results`),
      apiFetch<{ questions: Question[] }>(`/api/cbt/tests/${testId}?include_answers=true`),
    ]).then(([r, p]) => { setRows(r); setPaper(p.questions); }).catch((e) => toast.push(errMsg(e), "error"));
  }, [testId, toast]);

  const graded = rows.filter((r) => r.status === "Graded" && r.pct != null);
  const avg = graded.length ? Math.round(graded.reduce((s, r) => s + (r.pct ?? 0), 0) / graded.length) : null;

  return (
    <Card className="p-4">
      <CardHead
        title="Results"
        icon="reports"
        subtitle={avg != null ? `${rows.length} attempt(s) · class average ${avg}% (graded)` : `${rows.length} attempt(s)`}
        actions={
          <Select aria-label="Test" className="field w-auto max-md:!w-full" value={testId} onChange={(e) => setTestId(e.target.value)}>
            {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        }
      />
      {rows.length === 0 ? <EmptyState title="No attempts yet" icon="reports" /> : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.attempt_id} className="rounded-xl bg-surface-2/70 px-3 py-2">
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === r.attempt_id ? null : r.attempt_id)}>
                <span className="max-md:min-w-0"><b>{r.student.fullName}</b> <span className="text-xs text-ink-3">{r.student.admissionNo}</span></span>
                <span className="flex items-center gap-1.5">
                  {r.auto_submitted && <Badge tone="amber">Auto-submitted</Badge>}
                  <Badge tone={r.status === "Graded" ? "emerald" : r.status === "Submitted" ? "sky" : "slate"}>{r.status}</Badge>
                  <span className="tnum font-semibold">{r.score ?? "—"} / {r.max_score ?? "—"}{r.pct != null ? ` (${r.pct}%)` : ""}</span>
                </span>
              </button>
              {open === r.attempt_id && (
                <ol className="mt-2 space-y-1.5 border-t border-line pt-2">
                  {paper.map((q, n) => (
                    <li key={q.id} className="text-xs">
                      <p className="font-medium text-ink">{n + 1}. {q.question}</p>
                      <p className="text-ink-2">
                        Answer: <b>{r.answers[q.id] || "—"}</b>
                        {q.type === "mcq" && <> · correct {q.correctOption}</>}
                        {" "}· marks {r.grades[q.id] ?? "pending"} / {q.marks}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
