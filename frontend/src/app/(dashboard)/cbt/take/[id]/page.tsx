"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, ROLE, useMe } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, PageHeader, Textarea, useToast } from "@/components/ui";
import { errMsg, OPTION_KEYS, type AttemptView } from "@/components/cbt/types";

type SubmitResult = { status: string; score: number; max_score: number; pending_manual_grading: boolean; auto_submitted: boolean; late_answers_ignored?: boolean };

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const localKey = (attemptId: string) => `cbt_pending:${attemptId}`;

function readLocal(attemptId: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(localKey(attemptId)) ?? "{}"); } catch { return {}; }
}
function writeLocal(attemptId: string, v: Record<string, string>) {
  try {
    if (Object.keys(v).length) localStorage.setItem(localKey(attemptId), JSON.stringify(v));
    else localStorage.removeItem(localKey(attemptId));
  } catch { /* storage blocked: server autosave still runs */ }
}

/**
 * The test player. The countdown is driven by the SERVER deadline (clock offset from
 * server_now, re-synced on load, every minute and when the tab comes back). Every
 * answer autosaves; unsaved changes are mirrored to localStorage so a refresh loses
 * nothing; at zero the attempt is submitted automatically.
 */
export default function TakeTestPage() {
  const { id } = useParams<{ id: string }>();
  const { me, loading: meLoading } = useMe();
  const toast = useToast();
  const [view, setView] = useState<AttemptView | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "pending" | "offline">("saved");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState(0);

  const offset = useRef(0); // serverNow - clientNow
  const deadline = useRef(0);
  const pending = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);
  const attemptId = view?.attempt_id;

  const sync = useCallback((v: AttemptView) => {
    offset.current = Date.parse(v.server_now) - Date.now();
    deadline.current = Date.parse(v.deadline);
  }, []);

  const flush = useCallback(async () => {
    if (!attemptId || submittedRef.current) return;
    const batch = { ...pending.current };
    if (!Object.keys(batch).length) return;
    setSaveState("saving");
    try {
      await apiFetch(`/api/cbt/attempts/${attemptId}/answers`, { method: "PUT", body: JSON.stringify({ answers: batch }) });
      for (const [k, v] of Object.entries(batch)) if (pending.current[k] === v) delete pending.current[k];
      writeLocal(attemptId, pending.current);
      setSaveState(Object.keys(pending.current).length ? "pending" : "saved");
    } catch (e) {
      setSaveState("offline");
      if (/time is up|already been submitted/i.test(errMsg(e))) toast.push(errMsg(e), "error");
    }
  }, [attemptId, toast]);

  // Load (start or resume) the attempt.
  useEffect(() => {
    if (meLoading || !hasRole(me, [ROLE.STUDENT])) return;
    apiFetch<AttemptView>(`/api/cbt/tests/${id}/start`, { method: "POST", body: JSON.stringify({}) })
      .then((v) => {
        sync(v);
        const local = v.status === "In Progress" ? readLocal(v.attempt_id) : {};
        pending.current = local;
        setAnswers({ ...v.answers, ...local });
        setView(v);
        if (v.status !== "In Progress") submittedRef.current = true;
        else if (Object.keys(local).length) setSaveState("pending");
      })
      .catch((e) => setError(errMsg(e)));
  }, [id, me, meLoading, sync]);

  const submit = useCallback(async (auto: boolean) => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      const r = await apiFetch<SubmitResult>(`/api/cbt/attempts/${attemptId}/submit`, { method: "POST", body: JSON.stringify({ answers: pending.current }) });
      writeLocal(attemptId, {});
      pending.current = {};
      setResult(r);
      if (auto) toast.push("Time is up — your test was submitted automatically", "success");
    } catch (e) {
      const msg = errMsg(e);
      if (/already been submitted/i.test(msg)) {
        writeLocal(attemptId, {});
        setResult({ status: "Submitted", score: 0, max_score: 0, pending_manual_grading: true, auto_submitted: auto });
      } else {
        submittedRef.current = false;
        toast.push(msg, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, toast]);

  // Countdown from the server deadline.
  useEffect(() => {
    if (!view || view.status !== "In Progress") return;
    const tick = () => {
      const left = Math.max(0, Math.floor((deadline.current - (Date.now() + offset.current)) / 1000));
      setRemaining(left);
      if (left === 0) void submit(true);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [view, submit]);

  // Re-sync the clock every minute and when the tab becomes visible again.
  useEffect(() => {
    if (!attemptId || view?.status !== "In Progress") return;
    const resync = () => {
      if (submittedRef.current) return;
      apiFetch<AttemptView>(`/api/cbt/attempts/${attemptId}`).then((v) => {
        sync(v);
        if (v.status !== "In Progress") { submittedRef.current = true; setView(v); }
      }).catch(() => undefined);
      void flush();
    };
    const t = setInterval(resync, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [attemptId, view?.status, sync, flush]);

  // Warn before leaving mid-test.
  useEffect(() => {
    if (!view || view.status !== "In Progress" || result) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [view, result]);

  const answer = (qid: string, value: string, immediate: boolean) => {
    if (submittedRef.current || !attemptId) return;
    setAnswers((a) => ({ ...a, [qid]: value }));
    pending.current = { ...pending.current, [qid]: value };
    writeLocal(attemptId, pending.current);
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), immediate ? 50 : 800);
  };

  if (meLoading) return <p className="text-sm text-ink-3">Loading…</p>;
  if (!hasRole(me, [ROLE.STUDENT])) return <EmptyState title="Only students can take tests" icon="cbt" action={<Link href="/cbt" className="btn-soft">Back to CBT</Link>} />;
  if (error) return <EmptyState title="Can't open this test" hint={error} icon="cbt" action={<Link href="/cbt" className="btn-soft">Back to my tests</Link>} />;
  if (!view) return <p className="text-sm text-ink-3">Opening your test…</p>;

  if (result || view.status !== "In Progress") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader icon="cbt" title={view.title} subtitle="Submitted" />
        <Card className="p-6 text-center">
          <p className="font-display text-xl font-bold text-ink">Your test has been submitted.</p>
          {(result?.auto_submitted ?? view.auto_submitted) && <p className="mt-1 text-sm text-ink-3">Time ran out, so it was submitted automatically with your saved answers.</p>}
          {result?.late_answers_ignored && <p className="mt-1 text-sm text-ink-3">Changes made after the deadline were not counted.</p>}
          <p className="mt-3 text-sm text-ink-2">
            {result && !result.pending_manual_grading && result.max_score > 0 ? <>Score: <b className="tnum">{result.score} / {result.max_score}</b></> : "Your result will appear under My results once your teacher has marked it."}
          </p>
          <Link href="/cbt" className="btn-primary mt-4 inline-flex">Back to my tests</Link>
        </Card>
      </div>
    );
  }

  const q = view.questions[current];
  const answered = view.questions.filter((x) => (answers[x.id] ?? "").trim()).length;
  const low = remaining !== null && remaining <= 60;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-soft backdrop-blur">
        <div className="min-w-0">
          <p className="truncate font-display font-bold text-ink">{view.title}</p>
          <p className="text-xs text-ink-3">{answered} of {view.questions.length} answered · {saveState === "saved" ? "All answers saved" : saveState === "saving" ? "Saving…" : saveState === "pending" ? "Unsaved changes" : "Offline — will retry"}</p>
        </div>
        <div className="flex items-center gap-3">
          <span role="timer" aria-live="polite" className={`tnum rounded-lg px-3 py-1.5 font-display text-xl font-bold ${low ? "bg-danger-soft text-danger-ink" : "bg-brand-50 text-brand-700"}`}>
            {remaining === null ? "--:--" : fmt(remaining)}
          </span>
          <Button variant="primary" loading={submitting} onClick={() => { if (confirm("Submit your test? You cannot change answers afterwards.")) void submit(false); }}>Submit</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="p-3 lg:order-2">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-3">Questions</p>
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-4">
            {view.questions.map((x, n) => (
              <button key={x.id} type="button" onClick={() => setCurrent(n)} aria-label={`Question ${n + 1}${(answers[x.id] ?? "").trim() ? ", answered" : ""}`}
                className={`rounded-md py-1.5 text-xs font-bold ${n === current ? "ring-2 ring-brand-500" : ""} ${(answers[x.id] ?? "").trim() ? "bg-brand-700 text-white" : "bg-surface-2 text-ink-2"}`}>
                {n + 1}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-3">
          {q && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-3">Question {current + 1} of {view.questions.length}</span>
                <Badge>{q.marks} mark{q.marks === 1 ? "" : "s"}</Badge>
              </div>
              <p className="mb-4 whitespace-pre-wrap text-[15px] font-medium text-ink">{q.question}</p>
              {q.type === "mcq" ? (
                <div className="space-y-2" role="radiogroup" aria-label={`Question ${current + 1} options`}>
                  {OPTION_KEYS.map(([k, key]) => (
                    <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${answers[q.id] === k ? "border-brand-500 bg-brand-50" : "border-line hover:bg-surface-2"}`}>
                      <input type="radio" name={q.id} checked={answers[q.id] === k} onChange={() => answer(q.id, k, true)} />
                      <b>{k}.</b> {q[key]}
                    </label>
                  ))}
                </div>
              ) : (
                <Textarea aria-label={`Answer to question ${current + 1}`} rows={8} maxLength={5000} placeholder="Write your answer…"
                  value={answers[q.id] ?? ""} onChange={(e) => answer(q.id, e.target.value, false)} />
              )}
              <div className="mt-4 flex justify-between">
                <Button disabled={current === 0} onClick={() => { void flush(); setCurrent(current - 1); }}>Previous</Button>
                <Button disabled={current >= view.questions.length - 1} onClick={() => { void flush(); setCurrent(current + 1); }}>Next</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
