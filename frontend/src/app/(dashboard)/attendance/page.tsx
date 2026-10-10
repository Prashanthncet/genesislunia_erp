"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, useToast } from "@/components/ui";
import { Plus, Check, AlertTriangle, Clock, UserCheck, X, Calendar, Search, RefreshCw, Send, Eye, Edit, Trash2, Loader2, Filter, Save } from "lucide-react";

type ClassItem = { id: string; name: string; section: string | null; _count?: { students: number } };
type Student = { id: string; admissionNo: string; fullName: string; rollNo: string | null; class?: { name: string } };
type AttendanceRecord = { studentId: string; status: "Present" | "Absent" | "Late" };

const STATUS_CONFIG = {
  Present: { color: "emerald", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  Absent: { color: "rose", bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500" },
  Late: { color: "amber", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },

};

export default function AttendancePage() {
  const [view, setView] = useState<"mark" | "register" | "analytics">("mark");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const toast = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("");

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  useEffect(() => {
    const loadClasses = async () => {
      try {
        const data = await apiFetch<ClassItem[]>("/api/classes");
        const list = Array.isArray(data) ? data : [];
        setClasses(list);
        if (list.length > 0) setSelectedClass(list[0].id);
      } catch (e) {
        console.error("Failed to load classes:", e);
      }
    };
    loadClasses();
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!selectedClass || !date) return;
    setLoading(true);
    try {
      const [studsRes, att] = await Promise.all([
        apiFetch<{ data: Student[] } | Student[]>(`/api/students?class_id=${selectedClass}&page_size=200`),
        apiFetch<AttendanceRecord[]>(`/api/attendance?class_id=${selectedClass}&date=${date}`),
      ]);
      const list = Array.isArray(studsRes) ? studsRes : (studsRes?.data ?? []);
      setStudents(list);
      const map: Record<string, string> = {};
      for (const r of att ?? []) map[r.studentId] = r.status;
      setAttendance(map);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [selectedClass, date]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const markAll = (status: string) => {
    const map: Record<string, string> = {};
    for (const s of students) map[s.id] = status;
    setAttendance(map);
  };

  const save = async () => {
    if (!students.length) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          class_id: selectedClass,
          date,
          records: students.map((s) => ({ student_id: s.id, status: attendance[s.id] ?? "Present" })),
        }),
      });
      setMessage("Attendance saved successfully ✓");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const notifyAbsent = async () => {
    setNotifyLoading(true);
    try {
      const res = await apiFetch<{ notified: number }>("/api/attendance/notify-absent", {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setMessage(`Absence notices sent to ${res.notified} parents`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Notify failed");
    } finally {
      setNotifyLoading(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (!filterStatus) return true;
    return attendance[s.id] === filterStatus;
  });

  const presentCount = Object.values(attendance).filter((v) => v === "Present").length;
  const absentCount = Object.values(attendance).filter((v) => v === "Absent").length;
  const lateCount = Object.values(attendance).filter((v) => v === "Late").length;

  const markedCount = Object.keys(attendance).length;
  const attendanceRate = markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0;

  return (
    <div className="relative min-h-screen">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <PageHeader
            icon="attendance"
            title="Attendance"
            subtitle="Track student attendance and monitor class participation"
          />
          <div className="flex items-center gap-3">
            <Button variant="soft" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
              <RefreshCw className="h-4 w-4" /> Today
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6">
          {[
            { id: "mark", label: "Mark Attendance", icon: UserCheck },
            { id: "register", label: "Monthly Register", icon: Calendar },
            { id: "analytics", label: "Analytics", icon: AlertTriangle },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id as typeof view)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${view === tab.id ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Reveal delay={0}>
            <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Students</span>
                <UserCheck className="h-5 w-5 text-slate-500" />
              </div>
              <p className="text-3xl font-bold">{students.length}</p>
              <p className="text-xs text-slate-400 mt-1">{selectedClass ? classes.find(c => c.id === selectedClass)?.name : "Select class"}</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Present</span>
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-bold text-emerald-700">{presentCount}</p>
              <div className="mt-2 h-2 bg-emerald-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${students.length > 0 ? (presentCount / students.length) * 100 : 0}%` }} />
              </div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-rose-600 uppercase tracking-wide">Absent</span>
                <X className="h-5 w-5 text-rose-600" />
              </div>
              <p className="text-3xl font-bold text-rose-700">{absentCount}</p>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-amber-600 uppercase tracking-wide">Late</span>
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <p className="text-3xl font-bold text-amber-700">{lateCount}</p>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Attendance Rate</span>
                <span className={`text-lg font-bold ${attendanceRate >= 80 ? "text-emerald-600" : attendanceRate >= 60 ? "text-amber-600" : "text-rose-600"}`}>
                  {attendanceRate}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${attendanceRate >= 80 ? "bg-emerald-500" : attendanceRate >= 60 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${attendanceRate}%` }} />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Filter Bar */}
        <Reveal delay={100}>
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <select
                value={selectedClass}
                onChange={(e) => { setSelectedClass(e.target.value); setDate(new Date().toISOString().split("T")[0]); }}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""} ({c._count?.students ?? 0} students)</option>
                ))}
              </select>
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500"
              >
                <option value="">All Status</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Late">Late</option>
            
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="soft" onClick={() => markAll("Present")}>
                <Check className="h-4 w-4" /> All Present
              </Button>
              <Button variant="primary" onClick={save} loading={saving} className="shadow-lg shadow-blue-500/20">
                <Save className="h-4 w-4" /> Save
              </Button>
              <Button variant="danger" onClick={notifyAbsent} loading={notifyLoading} disabled={!absentCount && !lateCount}>
                <Send className="h-4 w-4" /> Notify ({absentCount + lateCount})
              </Button>
            </div>
          </div>
        </Reveal>

        {/* Main Content Area */}
        <Reveal delay={200}>
          {view === "mark" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3.5 whitespace-nowrap">Student</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Roll No</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Admission No</th>
                      <th className="px-5 py-3.5 whitespace-nowrap text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student, idx) => {
                        const status = attendance[student.id] || "Present";
                        const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
                        return (
                          <tr
                            key={student.id}
                            className="group transition-colors duration-150 hover:bg-slate-50/70"
                          >
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs ${idx % 8 === 0 ? "bg-gradient-to-br from-blue-500 to-indigo-600" : idx % 8 === 1 ? "bg-gradient-to-br from-emerald-500 to-teal-600" : idx % 8 === 2 ? "bg-gradient-to-br from-violet-500 to-purple-600" : idx % 8 === 3 ? "bg-gradient-to-br from-amber-500 to-orange-600" : idx % 8 === 4 ? "bg-gradient-to-br from-rose-500 to-pink-600" : idx % 8 === 5 ? "bg-gradient-to-br from-cyan-500 to-blue-600" : idx % 8 === 6 ? "bg-gradient-to-br from-indigo-500 to-blue-600" : "bg-gradient-to-br from-slate-600 to-slate-800"}`}>
                                  {(student.fullName || "Student").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900">{student.fullName || "Unknown"}</p>
                                  <p className="text-xs text-slate-400">
                                    {student.class ? student.class.name : ""}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 font-medium">
                              {student.rollNo ?? "—"}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-slate-600">
                              <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 font-medium">{student.admissionNo || "—"}</span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap text-center">
                              <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60">
                                {(["Present", "Absent", "Late"] as const).map((statusOption) => {
                                  const cfg = STATUS_CONFIG[statusOption];
                                  const isActive = status === statusOption;
                                  return (
                                    <button
                                      key={statusOption}
                                      onClick={() => setAttendance({ ...attendance, [student.id]: statusOption })}
                                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${isActive ? `${cfg.bg} ${cfg.text} border ${cfg.border} shadow-xs scale-100` : "text-slate-500 hover:text-slate-800 hover:bg-white"}`}
                                    >
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${isActive ? cfg.dot : "bg-slate-300"} mr-1.5`} />
                                      {statusOption}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-12 text-center">
                          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-3">
                            <UserCheck className="h-7 w-7 text-slate-400" />
                          </div>
                          <p className="text-sm font-medium text-slate-600">No students found</p>
                          <p className="text-xs text-slate-400 mt-1">Select a class to mark attendance</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              {filteredStudents.length > 0 && (
                <div className="flex items-center justify-between px-6 py-4 bg-slate-50/50 border-t border-slate-200 text-sm">
                  <span>
                    <span className="font-semibold text-slate-800">{markedCount}</span> of {filteredStudents.length} marked
                  </span>
                  <span className="text-slate-500 text-xs">
                    <span className="font-semibold text-emerald-600">{presentCount}</span> Present · <span className="font-semibold text-rose-600">{absentCount}</span> Absent · <span className="font-semibold text-amber-600">{lateCount}</span> Late
                  </span>
                </div>
              )}
            </div>
          )}

          {view === "register" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Monthly Attendance Register</h3>
                  <span className="text-xs text-slate-500">{month}</span>
                </div>
              </div>
              <div className="p-6 text-center text-slate-400">
                <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium">Monthly register view coming soon</p>
                <p className="text-xs mt-1">View complete attendance history for the selected month</p>
              </div>
            </div>
          )}

          {view === "analytics" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">Attendance Overview</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Today's Attendance</p>
                      <p className="text-2xl font-bold text-emerald-700">{attendanceRate}%</p>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                      <span className="text-2xl font-bold text-emerald-700">{presentCount}/{students.length}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-emerald-50 text-center">
                      <p className="text-xs text-emerald-600 mb-1">Perfect Days</p>
                      <p className="text-lg font-bold text-emerald-700">--</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 text-center">
                      <p className="text-xs text-amber-600 mb-1">Avg Attendance</p>
                      <p className="text-lg font-bold text-amber-700">--%</p>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 text-center">
                      <p className="text-xs text-rose-600 mb-1">Absent Days</p>
                      <p className="text-lg font-bold text-rose-700">--</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">Class-wise Attendance</h3>
                <div className="space-y-3">
                  {classes.map((cls) => (
                    <div key={cls.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-800">{cls.name} {cls.section}</p>
                        <p className="text-xs text-slate-500">{cls._count?.students ?? 0} students</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">85%</p>
                        <p className="text-xs text-emerald-600">+2% this week</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </div>
  );
}
