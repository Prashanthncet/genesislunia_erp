"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

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

  const handleSearch = async () => {
    if (!studentId) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      setReport(await apiFetch<ReportData>(`/api/exams/reports/${studentId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Student not found");
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
      <div>
        <h2 className="text-xl font-bold text-slate-900">Ledger &amp; Reports</h2>
        <p className="text-sm text-slate-500">CBSE report cards generated from exam marks.</p>
      </div>

      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder="Student ID (e.g. stu_001)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {loading ? "Searching…" : "Generate Report"}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h3 className="text-lg font-bold">{report.student.full_name}</h3>
              <p className="text-sm text-slate-500">
                {report.student.admission_no} · {report.student.class_name ?? "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-blue-700">{overall}%</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Overall · Grade {grade(overall)}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
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
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs font-bold">{r.subject_code}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{r.subject_name}</span>
                        <span className="block text-xs text-slate-400">{r.exam_name}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.date}</td>
                      <td className="px-4 py-3">
                        <strong>{r.score}</strong>
                        <span className="text-slate-400"> / {r.max_score}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            pct >= 60 ? "bg-emerald-50 text-emerald-700" : pct >= 40 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {grade(pct)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
