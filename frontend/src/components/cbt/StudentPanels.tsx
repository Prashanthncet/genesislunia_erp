"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Card, CardHead, EmptyState, useToast } from "@/components/ui";
import { errMsg } from "./types";

type MyTest = {
  id: string; title: string; duration_min: number; starts_at: string | null; window_end: string | null; test_status: string;
  question_count: number; attempt_id: string | null; my_status: string; can_start: boolean; deadline: string | null;
};

type MyResult = {
  attempt_id: string; title: string; status: string; submitted_at: string | null; auto_submitted: boolean;
  score: number | null; max_score: number | null;
  breakdown: { question_id: string; question: string; type: string; marks: number; your_answer: string | null; awarded: number; correct_option: string | null; options?: Record<string, string | null> }[] | null;
};

const tone = (s: string) => (s === "Graded" ? "emerald" : s === "Submitted" ? "sky" : s === "In Progress" ? "amber" : s === "Not started" ? "brand" : "slate") as "emerald" | "sky" | "amber" | "brand" | "slate";

export function MyTestsPanel() {
  const toast = useToast();
  const [tests, setTests] = useState<MyTest[] | null>(null);
  useEffect(() => { apiFetch<MyTest[]>("/api/cbt/my-tests").then(setTests).catch((e) => { setTests([]); toast.push(errMsg(e), "error"); }); }, [toast]);

  return (
    <Card className="p-4">
      <CardHead title="My tests" icon="cbt" />
      {!tests ? <p className="text-sm text-ink-3">Loading…</p> : tests.length === 0 ? <EmptyState title="No tests for your class right now" icon="cbt" /> : (
        <ul className="space-y-2 text-sm">
          {tests.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2/70 px-3 py-2 max-md:gap-3 max-md:py-3">
              <div className="max-md:min-w-0 max-md:flex-1 max-md:basis-full">
                <p className="font-semibold max-md:[overflow-wrap:anywhere]">{t.title}</p>
                <p className="text-xs text-ink-3">
                  {t.question_count} questions · {t.duration_min} min
                  {t.starts_at ? ` · opens ${when(t.starts_at)}` : ""}
                  {t.window_end ? ` · closes ${when(t.window_end)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 max-md:w-full max-md:justify-between">
                <Badge tone={tone(t.my_status)}>{t.my_status}</Badge>
                {t.can_start && (
                  <Link href={`/cbt/take/${t.id}`} className="btn-primary !px-3 !py-1.5 text-[12.5px]">
                    {t.my_status === "In Progress" ? "Resume" : "Start"}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MyResultsPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<MyResult[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { apiFetch<MyResult[]>("/api/cbt/my-results").then(setRows).catch((e) => { setRows([]); toast.push(errMsg(e), "error"); }); }, [toast]);

  return (
    <Card className="p-4">
      <CardHead title="My results" icon="reports" subtitle="Scores appear once your teacher has marked the written answers." />
      {!rows ? <p className="text-sm text-ink-3">Loading…</p> : rows.length === 0 ? <EmptyState title="No submitted tests yet" icon="reports" /> : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.attempt_id} className="rounded-xl bg-surface-2/70 px-3 py-2 max-md:py-3">
              <button type="button" disabled={!r.breakdown} className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === r.attempt_id ? null : r.attempt_id)}>
                <span className="font-semibold max-md:min-w-0 max-md:[overflow-wrap:anywhere]">{r.title}</span>
                <span className="flex items-center gap-1.5">
                  {r.auto_submitted && <Badge tone="amber">Auto-submitted</Badge>}
                  <Badge tone={r.status === "Graded" ? "emerald" : "sky"}>{r.status}</Badge>
                  {r.score != null && <span className="tnum font-bold">{r.score} / {r.max_score}</span>}
                </span>
              </button>
              {open === r.attempt_id && r.breakdown && (
                <ol className="mt-2 space-y-1.5 border-t border-line pt-2 text-xs">
                  {r.breakdown.map((b, n) => (
                    <li key={b.question_id}>
                      <p className="font-medium text-ink">{n + 1}. {b.question}</p>
                      <p className="text-ink-2">
                        Your answer: <b>{b.your_answer || "—"}</b>
                        {b.correct_option ? <> · correct {b.correct_option}</> : null}
                        {" "}· {b.awarded} / {b.marks}
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

/** Both ends of the window are UTC instants from the API; show them in the viewer's clock. */
function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
