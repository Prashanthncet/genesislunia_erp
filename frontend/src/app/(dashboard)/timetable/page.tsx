"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, useToast } from "@/components/ui";
import { Clock, Calendar, Users, MapPin, ChevronLeft, ChevronRight, Plus, Minus, RotateCcw, AlertTriangle, Eye, Edit, Trash2, RefreshCw } from "lucide-react";

type ClassItem = { id: string; name: string; section: string | null };
type Teacher = { id: string; name: string; email: string | null; subjects: string | null; isActive: boolean; maxPeriodsPerDay: number };
type Room = { id: string; name: string; type: string; capacity: number };
type PeriodConfig = { id: string; periodNumber: number; startTime: string; endTime: string; isBreak: boolean; breakName: string | null };
type Slot = { period_number: number; subject: string; teacher_name: string; room_name: string | null; substitution: { substitute_name: string; reason: string | null } | null };
type MasterSlot = { day_of_week: string; period_number: number; subject: string; teacher_name: string };
type Substitution = { id: string; class_name: string; period_number: number; original_teacher_name: string | null; substitute_name: string; reason: string | null };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TABS = ["Live Schedule", "Master Grid", "Auto-Generator", "Manage Teachers", "Substitutions"] as const;

export default function TimetablePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Live Schedule");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [periods, setPeriods] = useState<PeriodConfig[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const [schedule, setSchedule] = useState<Slot[]>([]);
  const [master, setMaster] = useState<MasterSlot[]>([]);
  const [subs, setSubs] = useState<Substitution[]>([]);

  const [periodsPerDay, setPeriodsPerDay] = useState(6);
  const [workingDays, setWorkingDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [genSubjects, setGenSubjects] = useState([
    { name: "Mathematics", teacher_id: "", periods_per_week: 5 },
    { name: "English", teacher_id: "", periods_per_week: 4 },
    { name: "Science", teacher_id: "", periods_per_week: 4 },
    { name: "Physics", teacher_id: "", periods_per_week: 3 },
    { name: "Chemistry", teacher_id: "", periods_per_week: 3 },
  ]);

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [t, r, p, c] = await Promise.all([
        apiFetch<Teacher[]>("/api/timetable/teachers"),
        apiFetch<Room[]>("/api/timetable/rooms"),
        apiFetch<PeriodConfig[]>("/api/timetable/periods"),
        apiFetch<ClassItem[]>("/api/classes"),
      ]);
      setTeachers(t ?? []);
      setRooms(r ?? []);
      setPeriods(p ?? []);
      setClasses(c ?? []);
      if (c?.length) setSelectedClass(c[0].id);
    } catch {
      setMessage("Failed to load timetable data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const loadTabData = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      if (tab === "Live Schedule") {
        const data = await apiFetch<{ schedule: Slot[] }>(`/api/timetable/today/${selectedClass}?date=${date}`);
        setSchedule(data.schedule ?? []);
      } else if (tab === "Master Grid") {
        setMaster(await apiFetch<MasterSlot[]>(`/api/timetable/master/${selectedClass}`));
      } else if (tab === "Substitutions") {
        setSubs(await apiFetch<Substitution[]>(`/api/timetable/substitutions?date=${date}`));
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [tab, selectedClass, date]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const markAbsent = async (teacherId: string) => {
    setSaving(true);
    try {
      const res = await apiFetch<{ substitutions: unknown[] }>(`/api/timetable/teachers/${teacherId}/absent`, {
        method: "POST",
        body: JSON.stringify({ date, reason: "Marked absent from UI" }),
      });
      setMessage(`Auto-substitutions generated: ${res.substitutions.length}`);
      await loadTabData();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const revokeSub = async (id: string) => {
    try {
      await apiFetch(`/api/timetable/substitutions/${id}`, { method: "DELETE" });
      await loadTabData();
      setMessage("Substitution revoked");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  };

  const generate = async () => {
    if (!selectedClass) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await apiFetch<{ generated: number }>("/api/timetable/generate", {
        method: "POST",
        body: JSON.stringify({
          class_id: selectedClass,
          periods_per_day: periodsPerDay,
          working_days: workingDays,
          subjects: genSubjects,
          overwrite: true,
        }),
      });
      setMessage(`Generated ${res.generated} timetable slots ✓`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setSaving(false);
    }
  };

  const periodLabel = (n: number) => periods.find((p) => p.periodNumber === n);
  const today = new Date(date);
  const dayName = DAYS[today.getDay() === 0 ? 6 : today.getDay() - 1];

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-violet-500/10 to-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-tl from-amber-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <PageHeader
            icon="timetable"
            title="Timetable & Scheduling"
            subtitle="Manage class schedules, teacher assignments, and substitutions"
          />
          <Button variant="soft" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
            <RefreshCw className="h-4 w-4" /> Today
          </Button>
        </div>

        <div className="flex items-center gap-2 px-6 overflow-x-auto">
          {TABS.map((t, idx) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${tab === t ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {t === "Live Schedule" && <Clock className="h-4 w-4" />}
              {t === "Master Grid" && <Calendar className="h-4 w-4" />}
              {t === "Auto-Generator" && <RotateCcw className="h-4 w-4" />}
              {t === "Manage Teachers" && <Users className="h-4 w-4" />}
              {t === "Substitutions" && <AlertTriangle className="h-4 w-4" />}
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Reveal delay={0}>
            <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-xl">
              <div className="flex items-center gap-3 mb-3">
                <Users className="h-5 w-5 text-slate-500" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Teachers</span>
              </div>
              <p className="text-3xl font-bold">{teachers.length}</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <MapPin className="h-5 w-5 text-blue-600" />
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Rooms</span>
              </div>
              <p className="text-3xl font-bold text-blue-700">{rooms.length}</p>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="rounded-2xl bg-violet-50 border border-violet-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <Clock className="h-5 w-5 text-violet-600" />
                <span className="text-xs font-medium text-violet-600 uppercase tracking-wide">Periods Today</span>
              </div>
              <p className="text-3xl font-bold text-violet-700">{schedule.length}</p>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="text-xs font-medium text-amber-600 uppercase tracking-wide">Substitutions</span>
              </div>
              <p className="text-3xl font-bold text-amber-700">{subs.length}</p>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="h-5 w-5 text-slate-600" />
                <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{dayName}</span>
              </div>
              <p className="text-xl font-bold text-slate-700">{date}</p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="relative flex-1 min-w-[200px]">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-10 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().split("T")[0]} className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <Button variant="primary" onClick={loadTabData} loading={loading} className="shadow-lg shadow-blue-500/20">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </Reveal>

        <Reveal delay={150}>
          {tab === "Live Schedule" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="grid grid-cols-[60px_80px_1.5fr_1.5fr_1fr_1fr] gap-4 px-6 py-4 bg-slate-50/50 border-b border-slate-200">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Teacher</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Room</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</div>
              </div>
              <div className="divide-y divide-slate-100">
                {schedule.map((slot, idx) => {
                  const period = periodLabel(slot.period_number);
                  const hasSub = slot.substitution !== null;
                  return (
                    <div key={idx} className="grid grid-cols-[60px_80px_1.5fr_1.5fr_1fr_1fr] gap-4 px-6 py-4 items-center transition-all duration-200 hover:bg-slate-50 group" style={{ animation: `fade-in 0.3s ease-out ${idx * 50}ms both`, animationName: "fade-in" }}>
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-slate-800">{slot.period_number}</span>
                        <span className="text-[10px] text-slate-400">{period?.isBreak ? "Break" : "Period"}</span>
                      </div>
                      <div className="text-sm text-slate-600 font-mono">{period ? `${period.startTime} - ${period.endTime}` : "--:--"}</div>
                      <div className="font-semibold text-slate-800">{slot.subject}</div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-white text-xs font-bold flex items-center justify-center">
                          {slot.teacher_name.charAt(0)}
                        </div>
                        <span className="text-sm text-slate-700">{slot.teacher_name}</span>
                      </div>
                      <div className="text-sm text-slate-600">{slot.room_name || "--"}</div>
                      <div className="flex justify-center">
                        {hasSub ? (
                          <Badge tone="amber" className="px-3 py-1.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            {slot.substitution?.substitute_name}
                          </Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Normal
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {schedule.length === 0 && (
                  <div className="py-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                      <Clock className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">No schedule for this day</p>
                    <p className="text-xs text-slate-400 mt-1">Generate timetable to see schedule</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "Master Grid" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/50 border-b border-slate-200">
                    <tr style={{ animation: "fade-in 0.3s ease-out both", animationName: "fade-in" }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Day</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Teacher</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {master.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors" style={{ animation: `fade-in 0.3s ease-out ${idx * 30}ms both`, animationName: "fade-in" }}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{m.day_of_week}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono">{m.period_number}</td>
                        <td className="px-4 py-3">{m.subject}</td>
                        <td className="px-4 py-3">{m.teacher_name}</td>
                        <td className="px-4 py-3 text-slate-500">--</td>
                      </tr>
                    ))}
                    {master.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          No master grid data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Auto-Generator" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-6">
              <h3 className="font-semibold text-slate-800 text-lg">Timetable Auto-Generator</h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Periods per Day</label>
                  <input
                    type="number" min={1} max={10}
                    value={periodsPerDay} onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Working Days</label>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setWorkingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${workingDays.includes(d) ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Subject Allocation</label>
                <div className="space-y-3">
                  {genSubjects.map((subj, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50">
                      <input
                        value={subj.name}
                        onChange={(e) => setGenSubjects(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                        placeholder="Subject"
                        className="flex-1 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <select
                        value={subj.teacher_id}
                        onChange={(e) => setGenSubjects(prev => prev.map((s, i) => i === idx ? { ...s, teacher_id: e.target.value } : s))}
                        className="flex-1 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">Select Teacher</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <input
                        type="number" min={0} max={20}
                        value={subj.periods_per_week}
                        onChange={(e) => setGenSubjects(prev => prev.map((s, i) => i === idx ? { ...s, periods_per_week: Number(e.target.value) } : s))}
                        className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <span className="text-xs text-slate-500">periods/week</span>
                      <button
                        onClick={() => setGenSubjects(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="soft" onClick={() => setGenSubjects(prev => [...prev, { name: "", teacher_id: "", periods_per_week: 3 }])} className="mt-3">
                  <Plus className="h-4 w-4" /> Add Subject
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium text-slate-700">Summary</span>
                  <span className="text-slate-500">Required: {genSubjects.reduce((a, s) => a + s.periods_per_week, 0)} periods</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (genSubjects.reduce((a, s) => a + s.periods_per_week, 0) / (workingDays.length * periodsPerDay)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">{workingDays.length} days × {periodsPerDay} periods = {workingDays.length * periodsPerDay} slots available</p>
              </div>

              <Button variant="primary" onClick={generate} loading={saving} className="w-full shadow-lg shadow-blue-500/20">
                <RotateCcw className="h-4 w-4" /> Generate Timetable
              </Button>
            </div>
          )}

          {tab === "Manage Teachers" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/70 border-b border-slate-200">
                    <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3.5 whitespace-nowrap">Teacher</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Subjects</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Max Periods/Day</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-center">Status</th>
                      <th className="px-5 py-3.5 whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {teachers.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center shadow-xs">
                              {t.name.charAt(0)}
                            </div>
                            <span className="font-semibold text-slate-900">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">{t.subjects || "—"}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 font-mono">{t.maxPeriodsPerDay}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-center">
                          <Badge tone={t.isActive ? "emerald" : "slate"} className="px-2.5 py-1">
                            {t.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-right">
                          <Button variant="soft" onClick={() => markAbsent(t.id)} className="!px-3 !py-1.5">
                            <Clock className="h-3.5 w-3.5" /> Mark Absent
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {teachers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">No teachers found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Substitutions" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/70 border-b border-slate-200">
                    <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3.5 whitespace-nowrap">Class</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Period</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Original Teacher</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Substitute</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Reason</th>
                      <th className="px-5 py-3.5 whitespace-nowrap text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {subs.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-slate-900">{s.class_name}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 font-mono">Period {s.period_number}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">{s.original_teacher_name || "—"}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold flex items-center justify-center shadow-xs">
                              {s.substitute_name.charAt(0)}
                            </div>
                            <span className="text-xs font-medium text-slate-800">{s.substitute_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">{s.reason || "—"}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-right">
                          <Button variant="danger" onClick={() => revokeSub(s.id)} className="!px-3 !py-1.5">
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {subs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No substitutions for this date</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </div>
  );
}

