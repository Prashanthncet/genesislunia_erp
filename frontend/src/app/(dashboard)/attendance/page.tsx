"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Field, Icon, Input, PageHeader, ProgressBar, Reveal, Select, StatCard, Tabs, useToast } from "@/components/ui";

type ClassItem = { id: string; name: string; section: string | null };
type Student = { id: string; admissionNo: string; fullName: string };
type AttendanceRow = { studentId: string; status: string };

const STATUSES = ["Present", "Absent", "Late"] as const;

type RegisterRow = { id: string; fullName: string; rollNo: string | null; days: Record<string, string>; present: number; marked: number };
type RegisterData = { month: string; dates: string[]; students: RegisterRow[] };

export default function AttendancePage() {
  const [view, setView] = useState<"mark" | "register">("mark");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [register, setRegister] = useState<RegisterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

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

  const loadRegister = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const data = await apiFetch<RegisterData>(`/api/attendance/register?class_id=${classId}&month=${month}`);
      setRegister(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Register load failed");
    } finally {
      setLoading(false);
    }
  }, [classId, month]);

  const loadStudentsImpl = useCallback(async () => {
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
    if (view === "register") {
      loadRegister();
    } else {
      loadStudentsImpl();
    }
  }, [view, loadRegister, loadStudentsImpl]);

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
      await loadStudentsImpl();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Add failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="attendance"
          title="Attendance"
          subtitle="Mark daily attendance and notify parents of absentees."
          actions={
            view === "mark" && (
              <Button variant="primary" onClick={() => setShowAdd(true)}>
                <Icon name="plus" className="h-4 w-4" /> Add Student
              </Button>
            )
          }
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Students" value={students.length} tone="brand" icon="students" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Present" value={Object.values(attendance).filter((v) => v === "Present").length} tone="emerald" icon="check" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Absent" value={Object.values(attendance).filter((v) => v === "Absent").length} tone="rose" icon="alert" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Marked Today" value={Object.keys(attendance).length} tone="amber" icon="attendance" hint={date} />
        </Reveal>
      </div>

      <Reveal delay={60}>
        <Tabs
          value={view}
          onChange={setView}
          tabs={[
            { id: "mark", label: "Mark" },
            { id: "register", label: "Monthly Register" },
          ]}
        />
      </Reveal>

      <Reveal delay={100}>
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <select
          aria-label="Class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="field w-auto"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.section ?? ""}
            </option>
          ))}
        </select>
        {view === "mark" ? (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field w-auto"
          />
        ) : (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="field w-auto"
          />
        )}
        <Button variant="soft" onClick={() => markAll("Present")}>
          <Icon name="check" className="h-4 w-4" /> All Present
        </Button>
        <Button variant="primary" onClick={save} loading={loading}>
          <Icon name="attendance" className="h-4 w-4" /> Save
        </Button>
        <Button variant="danger" onClick={notifyAbsent} loading={loading}>
          <Icon name="bell" className="h-4 w-4" /> Notify Absent
        </Button>
      </div>
      </Reveal>

      {view === "mark" && (
      <div key="mark" className="card overflow-x-auto" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Admission No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="row-hover border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{s.admissionNo}</td>
                <td className="px-4 py-3 font-semibold">{s.fullName}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-1">
                    {STATUSES.map((st) => (
                      <button
                        key={st}
                        onClick={() => setAttendance({ ...attendance, [s.id]: st })}
                        aria-pressed={(attendance[s.id] ?? "Present") === st}
                        className={`min-w-[4.5rem] cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                          (attendance[s.id] ?? "Present") === st
                            ? st === "Present"
                              ? "bg-emerald-600 text-white shadow-soft"
                              : st === "Absent"
                                ? "bg-rose-600 text-white shadow-soft"
                                : "bg-amber-500 text-white shadow-soft"
                            : "bg-slate-100 text-slate-600 hover:scale-105 hover:bg-slate-200"
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
      )}

      {view === "register" && (
        <div key="register" className="card overflow-x-auto" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Student</th>
                {register?.dates.map((d) => (
                  <th key={d} className="px-2 py-3 text-center text-[10px]">{d.slice(-2)}</th>
                ))}
                <th className="px-4 py-3 text-center">%</th>
              </tr>
            </thead>
            <tbody>
              {(register?.students ?? []).map((s) => (
                <tr key={s.id} className="row-hover border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap font-semibold">
                    {s.fullName} <span className="text-xs text-slate-400">{s.rollNo ? `· ${s.rollNo}` : ""}</span>
                  </td>
                  {register?.dates.map((d) => (
                    <td key={d} className="px-2 py-2 text-center text-xs">
                      {s.days[d] === "Present" ? (
                        <span className="font-bold text-emerald-600">P</span>
                      ) : s.days[d] === "Absent" ? (
                        <span className="font-bold text-rose-600">A</span>
                      ) : s.days[d] === "Late" ? (
                        <span className="font-bold text-amber-600">L</span>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-center text-xs font-bold">
                    {s.marked > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="hidden w-12 sm:block">
                          <ProgressBar
                            value={(s.present / s.marked) * 100}
                            tone={s.present / s.marked >= 0.75 ? "emerald" : s.present / s.marked >= 0.5 ? "amber" : "rose"}
                          />
                        </span>
                        <span className="tnum">{Math.round((s.present / s.marked) * 100)}%</span>
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {(register?.students.length ?? 0) === 0 && (
                <tr><td colSpan={(register?.dates.length ?? 0) + 2} className="px-4 py-8 text-center text-slate-400">
                  {loading ? "Loading…" : "No marked attendance in this month."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="card w-full max-w-md p-6" style={{ animation: "scale-in 0.3s var(--ease-spring) both" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Icon name="students" className="h-5 w-5 text-brand-600" /> Add Student
            </h3>
            <div className="space-y-3">
              <Field label="Admission no">
                <Input value={newAdmNo} onChange={(e) => setNewAdmNo(e.target.value)} placeholder="ADM-2026-0001" />
              </Field>
              <Field label="Full name">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Student name" />
              </Field>
              <Field label="Gender">
                <Select value={newGender} onChange={(e) => setNewGender(e.target.value)}>
                  {["Male", "Female", "Other"].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="soft" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button variant="primary" onClick={addStudent} loading={loading}>Add</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
