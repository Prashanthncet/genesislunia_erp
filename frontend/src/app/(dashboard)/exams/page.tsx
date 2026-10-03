"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  AnimatedNumber, Badge, Button, Icon, PageHeader, ProgressBar, Reveal, useToast,
} from "@/components/ui";

type ReportData = {
  student: { full_name: string; admission_no: string; class_name: string | null };
  results: Array<{
    exam_name: string;
    date: string;
    subject_code: string;
    subject_name: string;
    score: number;
    max_score: number;
  }>;
};

function grade(pct: number): string {
  if (pct >= 90) return "A1";
  if (pct >= 80) return "A2";
  if (pct >= 70) return "B1";
  if (pct >= 60) return "B2";
  if (pct >= 50) return "C1";
  if (pct >= 40) return "C2";
  return "D";
}

export default function ExamsPage() {
  const [studentId, setStudentId] = useState("stu_001");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  function flash(text: string, tone: "success" | "error" | "info" = "success") {
    setError("");
    toast.push(text, tone);
  }

  const handleSearch = async () => {
    if (!studentId) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      setReport(await apiFetch<ReportData>(`/api/exams/reports/${studentId}`));
    } catch (e) {
      flash(e instanceof Error ? e.message : "Student not found", "error");
    } finally {
      setLoading(false);
    }
  };

  const overall = report?.results.length
    ? Math.round(
        (report.results.reduce((a, r) => a + r.score, 0) /
          report.results.reduce((a, r) => a + r.max_score, 0)) *
          100,
      )
    : 0;

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="exams"
          title="Ledger & Reports"
          subtitle="CBSE report cards generated from exam marks."
        />
      </Reveal>

      <Reveal delay={60}>
        <div className="card flex gap-2 p-4">
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="Student ID (e.g. stu_001)"
            aria-label="Student ID"
            className="field flex-1 font-mono"
          />
          <Button variant="primary" onClick={handleSearch} loading={loading}>
            <Icon name="exams" className="h-4 w-4" /> Generate Report
          </Button>
        </div>
      </Reveal>

      {report && (
        <div key={report.student.admission_no} className="space-y-4" style={{ animation: "fade-up 0.5s var(--ease-out-soft) both" }}>
          <div className="card relative overflow-hidden p-5">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-brand-500/20 to-transparent blur-2xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">{report.student.full_name}</h3>
                <p className="text-sm text-slate-500">
                  {report.student.admission_no} · {report.student.class_name ?? "—"}
                </p>
                <div className="mt-3 max-w-xs">
                  <ProgressBar value={overall} tone={overall >= 60 ? "emerald" : overall >= 40 ? "amber" : "rose"} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-4xl font-black text-brand-700">
                  <AnimatedNumber value={overall} suffix="%" />
                </p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Overall · Grade {grade(overall)}
                </p>
              </div>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Subject &amp; Exam</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Grade</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((r, i) => {
                  const pct = Math.round((r.score / r.max_score) * 100);
                  return (
                    <tr key={i} className="row-hover border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs font-bold">{r.subject_code}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{r.subject_name}</span>
                        <span className="block text-xs text-slate-400">{r.exam_name}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.date}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <strong className="tnum">{r.score}</strong>
                          <span className="text-slate-400 tnum">/ {r.max_score}</span>
                          <span className="hidden w-16 sm:block">
                            <ProgressBar value={pct} tone={pct >= 60 ? "emerald" : pct >= 40 ? "amber" : "rose"} />
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={pct >= 60 ? "emerald" : pct >= 40 ? "amber" : "rose"}>{grade(pct)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              {report.results.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No marks recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
