"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, ProgressBar, Reveal, StatCard, useToast } from "@/components/ui";

type Question = {
  id: string; question: string; type: string; optionA: string | null; optionB: string | null;
  optionC: string | null; optionD: string | null; correctOption: string | null; marks: number;
  subjectId: string | null; classId: string | null;
};
type CbtTest = { id: string; title: string; classId: string; durationMin: number; status: string; startsAt: string | null };
type ResultRow = { attempt_id: string; student: { fullName: string; admissionNo: string }; score: number | null; max_score: number | null; pct: number | null };
type Subject = { id: string; name: string };
type ClassItem = { id: string; name: string; section: string | null };
type Attempt = { attempt_id: string; score: number | null; max_score: number | null; pending_manual_grading: boolean };

type Tab = "questions" | "tests" | "results";

export default function CbtPage() {
  const [tab, setTab] = useState<Tab>("questions");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tests, setTests] = useState<CbtTest[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  // question form
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState("mcq");
  const [qOpts, setQOpts] = useState({ a: "", b: "", c: "", d: "" });
  const [qCorrect, setQCorrect] = useState("A");
  const [qMarks, setQMarks] = useState("1");
  const [qSubject, setQSubject] = useState("");
  const [qClass, setQClass] = useState("");

  // test form
  const [tTitle, setTTitle] = useState("");
  const [tClass, setTClass] = useState("");
  const [tSubject, setTSubject] = useState("");
  const [tDuration, setTDuration] = useState("30");
  const [tStartsAt, setTStartsAt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // results
  const [resultsTest, setResultsTest] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [paper, setPaper] = useState<{ id: string; questions: Question[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qs, ts] = await Promise.all([
        apiFetch<Question[]>("/api/cbt/questions"),
        apiFetch<CbtTest[]>("/api/cbt/tests"),
      ]);
      setQuestions(qs ?? []);
      setTests(ts ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch<Subject[]>("/api/academics/subjects").then(setSubjects).catch(() => undefined);
    apiFetch<ClassItem[]>("/api/classes").then((cs) => { setClasses(cs ?? []); if (cs?.length) setTClass(cs[0].id); }).catch(() => undefined);
  }, []);

  const addQuestion = async () => {
    if (!qText) return setMessage("Question text is required");
    if (qType === "mcq" && (!qOpts.a || !qOpts.b || !qOpts.c || !qOpts.d)) return setMessage("All four options are required for MCQ");
    setLoading(true);
    try {
      await apiFetch("/api/cbt/questions", {
        method: "POST",
        body: JSON.stringify({
          question: qText, type: qType,
          option_a: qType === "mcq" ? qOpts.a : undefined,
          option_b: qType === "mcq" ? qOpts.b : undefined,
          option_c: qType === "mcq" ? qOpts.c : undefined,
          option_d: qType === "mcq" ? qOpts.d : undefined,
          correct_option: qType === "mcq" ? qCorrect : undefined,
          marks: Number(qMarks) || 1,
          subject_id: qSubject || undefined, class_id: qClass || undefined,
        }),
      });
      setQText(""); setQOpts({ a: "", b: "", c: "", d: "" });
      await load();
      setMessage("Question added ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deleteQuestion = async (id: string) => {
    try { await apiFetch(`/api/cbt/questions/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const createTest = async () => {
    if (!tTitle || selected.size === 0) return setMessage("Title and at least one question are required");
    setLoading(true);
    try {
      await apiFetch("/api/cbt/tests", {
        method: "POST",
        body: JSON.stringify({
          title: tTitle, class_id: tClass, subject_id: tSubject || undefined,
          duration_min: Number(tDuration) || 30, question_ids: Array.from(selected),
          starts_at: tStartsAt ? new Date(tStartsAt).toISOString() : undefined,
        }),
      });
      setTTitle(""); setSelected(new Set());
      await load();
      setMessage("Test created as Draft — publish when ready ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const testAction = async (id: string, action: "publish" | "complete" | "delete") => {
    setLoading(true);
    try {
      if (action === "delete") await apiFetch(`/api/cbt/tests/${id}`, { method: "DELETE" });
      else await apiFetch(`/api/cbt/tests/${id}/${action}`, { method: "PUT" });
      await load();
      setMessage(`Test ${action}d ✓`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const loadResults = async (testId: string) => {
    setResultsTest(testId);
    setPaper(null);
    if (!testId) { setResults([]); return; }
    try {
      const rows = await apiFetch<ResultRow[]>(`/api/cbt/tests/${testId}/results`);
      setResults(rows ?? []);
      // staff preview of the paper with answers for grading
      const t = await apiFetch<{ id: string; questions: Question[] }>(`/api/cbt/tests/${testId}?include_answers=true`);
      setPaper(t);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const gradeAttempt = async (attemptId: string, questionId: string) => {
    const input = window.prompt("Marks to award:");
    if (input === null) return;
    try {
      await apiFetch(`/api/cbt/attempts/${attemptId}/grade`, {
        method: "PUT",
        body: JSON.stringify({ question_id: questionId, marks: Number(input) }),
      });
      await loadResults(resultsTest);
      setMessage("Attempt graded ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const selectedQuestions = questions.filter((q) => selected.has(q.id));
  const totalMarks = selectedQuestions.reduce((s, q) => s + q.marks, 0);

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="cbt"
          title="Computer Based Tests"
          subtitle="Question bank, server-timed tests, auto-graded MCQs and a manual grading queue."
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Questions" value={questions.length} tone="brand" icon="cbt" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Tests" value={tests.length} tone="violet" icon="exams" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Published" value={tests.filter((t) => t.status === "Published").length} tone="emerald" icon="check" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Selected Paper" value={selected.size} tone="amber" icon="spark" hint={`${totalMarks} marks`} />
        </Reveal>
      </div>

      <Reveal delay={60} className="flex flex-wrap gap-2">
        {(["questions", "tests", "results"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative overflow-hidden rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 ${
              tab === t ? "text-white shadow-lift" : "border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700"
            }`}>
            {tab === t && <span className="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-800" />}
            <span className="relative">{t === "questions" ? "Question Bank" : t === "tests" ? "Tests" : "Results & Grading"}</span>
          </button>
        ))}
      </Reveal>

      {tab === "questions" && (
        <div key="questions" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="plus" className="h-4 w-4 text-brand-600" /> Add Question
            </h3>
            <div className="space-y-2">
              <textarea value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Question text *" rows={2} className="field min-h-20 resize-y" />
              <div className="flex flex-wrap gap-2">
                <select value={qType} aria-label="Question type" onChange={(e) => setQType(e.target.value)} className="field w-auto">
                  <option value="mcq">MCQ</option>
                  <option value="subjective">Subjective</option>
                </select>
                <select value={qSubject} aria-label="Subject" onChange={(e) => setQSubject(e.target.value)} className="field w-auto">
                  <option value="">Any subject</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={qClass} aria-label="Class" onChange={(e) => setQClass(e.target.value)} className="field w-auto">
                  <option value="">Any class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
                </select>
                <input value={qMarks} onChange={(e) => setQMarks(e.target.value)} type="number" placeholder="Marks" className="field w-24" />
              </div>
              {qType === "mcq" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2"><input type="radio" checked={qCorrect === "A"} onChange={() => setQCorrect("A")} className="h-4 w-4 accent-brand-600" /><input value={qOpts.a} onChange={(e) => setQOpts({ ...qOpts, a: e.target.value })} placeholder="Option A *" className="field flex-1" /></div>
                  <div className="flex items-center gap-2"><input type="radio" checked={qCorrect === "B"} onChange={() => setQCorrect("B")} className="h-4 w-4 accent-brand-600" /><input value={qOpts.b} onChange={(e) => setQOpts({ ...qOpts, b: e.target.value })} placeholder="Option B *" className="field flex-1" /></div>
                  <div className="flex items-center gap-2"><input type="radio" checked={qCorrect === "C"} onChange={() => setQCorrect("C")} className="h-4 w-4 accent-brand-600" /><input value={qOpts.c} onChange={(e) => setQOpts({ ...qOpts, c: e.target.value })} placeholder="Option C *" className="field flex-1" /></div>
                  <div className="flex items-center gap-2"><input type="radio" checked={qCorrect === "D"} onChange={() => setQCorrect("D")} className="h-4 w-4 accent-brand-600" /><input value={qOpts.d} onChange={(e) => setQOpts({ ...qOpts, d: e.target.value })} placeholder="Option D *" className="field flex-1" /></div>
                </div>
              )}
              <Button variant="primary" onClick={addQuestion} loading={loading}>
              <Icon name="plus" className="h-4 w-4" /> Add Question
            </Button>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-4 py-3">Question</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Correct</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="row-hover border-t border-slate-100">
                    <td className="max-w-sm px-4 py-3"><span className="line-clamp-2">{q.question}</span></td>
                    <td className="px-4 py-3"><Badge tone="sky">{q.type.toUpperCase()}</Badge></td>
                    <td className="px-4 py-3">{q.type === "mcq" ? <Badge tone="emerald">{q.correctOption}</Badge> : "—"}</td>
                    <td className="px-4 py-3 tnum">{q.marks}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap"><button onClick={() => deleteQuestion(q.id)} className="btn-danger !px-2.5 !py-1 text-xs">Delete</button></td>
                  </tr>
                ))}
                {questions.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No questions yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "tests" && (
        <div key="tests" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="exams" className="h-4 w-4 text-violet-500" /> Create Test
            </h3>
            <div className="flex flex-wrap gap-2 text-sm">
              <input value={tTitle} onChange={(e) => setTTitle(e.target.value)} placeholder="Test title *" className="field w-auto" />
              <select value={tClass} aria-label="Class" onChange={(e) => setTClass(e.target.value)} className="field w-auto">
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
              </select>
              <select value={tSubject} aria-label="Subject" onChange={(e) => setTSubject(e.target.value)} className="field w-auto">
                <option value="">Any subject</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input value={tDuration} onChange={(e) => setTDuration(e.target.value)} type="number" placeholder="Duration (min)" className="field w-32" />
              <input value={tStartsAt} onChange={(e) => setTStartsAt(e.target.value)} type="datetime-local" className="field w-auto" />
            </div>
            <p className="mt-2 text-xs text-slate-500">{selected.size} question(s) selected · {totalMarks} marks total</p>
            <div className="mt-2 max-w-xs"><ProgressBar value={selected.size ? Math.min(100, selected.size) : 0} tone="brand" /></div>
            <Button variant="accent" onClick={createTest} loading={loading} className="mt-3">
              <Icon name="spark" className="h-4 w-4" /> Create Draft Test
            </Button>
          </div>

          <ul className="space-y-2">
            {tests.map((t) => (
              <li key={t.id} className="card card-hover flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{t.title}</span>
                <span className="text-slate-500">{t.durationMin} min</span>
                <span className="ml-auto"><Badge tone={t.status === "Published" ? "emerald" : t.status === "Completed" ? "slate" : "amber"}>{t.status}</Badge></span>
                {t.status === "Draft" && <button onClick={() => testAction(t.id, "publish")} className="btn-soft !px-2.5 !py-1 text-xs">Publish</button>}
                {t.status === "Published" && <button onClick={() => testAction(t.id, "complete")} className="btn-soft !px-2.5 !py-1 text-xs">Complete</button>}
                <button onClick={() => testAction(t.id, "delete")} className="btn-danger !px-2.5 !py-1 text-xs">Delete</button>
              </li>
            ))}
            {tests.length === 0 && <li className="card py-8 text-center text-slate-400">No tests yet.</li>}
          </ul>
        </div>
      )}

      {tab === "results" && (
        <div key="results" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card p-4">
            <select value={resultsTest} aria-label="Test" onChange={(e) => loadResults(e.target.value)} className="field w-auto">
              <option value="">Select a test to view results…</option>
              {tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.status})</option>)}
            </select>
          </div>

          {paper && (
            <div className="card p-4 text-sm">
              <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-800">
                <Icon name="exams" className="h-4 w-4 text-brand-600" /> Paper (with answers)
              </h3>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
                {paper.questions.map((q) => (
                  <li key={q.id}>{q.question} {q.type === "mcq" && <b className="text-emerald-700">[{q.correctOption}]</b>}</li>
                ))}
              </ol>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3 text-right">Score</th><th className="px-4 py-3 text-right">%</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.attempt_id} className="row-hover border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">{r.student.fullName}</td>
                    <td className="px-4 py-3 text-right tnum">{r.score ?? "—"}/{r.max_score ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {r.pct === null ? "—" : (
                        <span className="inline-flex items-center gap-2">
                          <span className="hidden w-20 sm:block"><ProgressBar value={r.pct} tone={r.pct >= 40 ? "emerald" : "rose"} /></span>
                          <b className="tnum">{r.pct}%</b>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {results.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">{resultsTest ? "No attempts yet." : "Select a test."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
