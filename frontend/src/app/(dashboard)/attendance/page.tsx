"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ClassItem = { id: string; name: string; section: string | null };
type Student = { id: string; admissionNo: string; fullName: string };
type AttendanceRow = { studentId: string; status: string };

const STATUSES = ["Present", "Absent", "Late"] as const;

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Add student modal
  const [showAdd, setShowAdd] = useState(false);
  const [newAdmNo, setNewAdmNo] = useState("");
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState("Male");

  useEffect(() => {
    apiFetch<ClassItem[]>("/api/classes")
      .then((data) => {
        setClasses(data ?? []);
        if (data?.length) setClassId(data[0].id);
      })
      .catch(() => console.error("Failed to load classes"));
  }, []);

  const loadStudents = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const [studs, att] = await Promise.all([
        apiFetch<Student[]>(`/api/students?class_id=${classId}`),
        apiFetch<AttendanceRow[]>(`/api/attendance?class_id=${classId}&date=${date}`),
      ]);
      setStudents(studs ?? []);
      const map: Record<string, string> = {};
      for (const r of att ?? []) map[r.studentId] = r.status;
      setAttendance(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [classId, date]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const markAll = (status: string) => {
    const map: Record<string, string> = {};
    for (const s of students) map[s.id] = status;
    setAttendance(map);
  };

  const save = async () => {
    if (!students.length) return;
    setLoading(true);
    setMessage("");
    try {
      await apiFetch("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          class_id: classId,
          date,
          records: students.map((s) => ({ student_id: s.id, status: attendance[s.id] ?? "Present" })),
        }),
      });
      setMessage("Attendance saved ✓");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const notifyAbsent = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notified: number }>("/api/attendance/notify-absent", {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setMessage(`Absence notices sent: ${res.notified}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Notify failed");
    } finally {
      setLoading(false);
    }
  };

  const addStudent = async () => {
    if (!newAdmNo || !newName) return;
    setLoading(true);
    try {
      await apiFetch("/api/students", {
        method: "POST",
        body: JSON.stringify({
          admission_no: newAdmNo,
          full_name: newName,
          gender: newGender,
          class_id: classId,
        }),
      });
      setShowAdd(false);
      setNewAdmNo("");
      setNewName("");
      await loadStudents();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Add failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Attendance</h2>
          <p className="text-sm text-slate-500">Mark daily attendance and notify parents of absentees.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          + Add Student
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.section ?? ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={() => markAll("Present")} className="text-sm font-semibold text-emerald-700 hover:underline">
          All Present
        </button>
        <button onClick={save} disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Save
        </button>
        <button onClick={notifyAbsent} disabled={loading} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
          Notify Absent
        </button>
        {message && <span className="text-sm font-semibold text-emerald-700">{message}</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Admission No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{s.admissionNo}</td>
                <td className="px-4 py-3 font-semibold">{s.fullName}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-1">
                    {STATUSES.map((st) => (
                      <button
                        key={st}
                        onClick={() => setAttendance({ ...attendance, [s.id]: st })}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          (attendance[s.id] ?? "Present") === st
                            ? st === "Present"
                              ? "bg-emerald-600 text-white"
                              : st === "Absent"
                                ? "bg-rose-600 text-white"
                                : "bg-amber-500 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  {loading ? "Loading…" : "No students in this class."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold">Add Student</h3>
            <div className="space-y-3">
              <input
                value={newAdmNo}
                onChange={(e) => setNewAdmNo(e.target.value)}
                placeholder="Admission No"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full Name"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={newGender}
                onChange={(e) => setNewGender(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {["Male", "Female", "Other"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={addStudent} disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
