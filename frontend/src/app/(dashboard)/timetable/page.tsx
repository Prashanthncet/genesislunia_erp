"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Teacher = { id: string; name: string; email: string | null; subjects: string | null; isActive: boolean; maxPeriodsPerDay: number };
type Room = { id: string; name: string; type: string; capacity: number };
type PeriodConfig = { id: string; periodNumber: number; startTime: string; endTime: string; isBreak: boolean; breakName: string | null };
type ClassItem = { id: string; name: string; section: string | null };
type Slot = {
  period_number: number;
  subject: string;
  teacher_name: string;
  room_name: string | null;
  substitution: { substitute_name: string; reason: string | null } | null;
};
type MasterSlot = { day_of_week: string; period_number: number; subject: string; teacher_name: string };
type Substitution = {
  id: string;
  class_name: string;
  period_number: number;
  original_teacher_name: string | null;
  substitute_name: string;
  reason: string | null;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TABS = ["Live Schedule", "Master Grid", "Auto-Generator", "Manage Teachers", "Substitutions"] as const;

export default function TimetablePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Live Schedule");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [periods, setPeriods] = useState<PeriodConfig[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // live schedule
  const [schedule, setSchedule] = useState<Slot[]>([]);
  // master grid
  const [master, setMaster] = useState<MasterSlot[]>([]);
  // substitutions
  const [subs, setSubs] = useState<Substitution[]>([]);
  // generator inputs
  const [periodsPerDay, setPeriodsPerDay] = useState(2);
  const [workingDays, setWorkingDays] = useState<string[]>(["Mon", "Tue"]);
  const [genSubjects, setGenSubjects] = useState([
    { name: "Maths", teacher_id: "t_meera", periods_per_week: 2 },
    { name: "English", teacher_id: "t_rajesh", periods_per_week: 1 },
    { name: "Physics", teacher_id: "t_arjun", periods_per_week: 1 },
  ]);

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
      if (c?.length) setClassId((prev) => prev || c[0].id);
    } catch {
      setMessage("Failed to load timetable metadata.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const loadTab = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      if (tab === "Live Schedule") {
        const data = await apiFetch<{ schedule: Slot[] }>(`/api/timetable/today/${classId}?date=${date}`);
        setSchedule(data.schedule ?? []);
      } else if (tab === "Master Grid") {
        setMaster(await apiFetch<MasterSlot[]>(`/api/timetable/master/${classId}`));
      } else if (tab === "Substitutions") {
        setSubs(await apiFetch<Substitution[]>(`/api/timetable/substitutions?date=${date}`));
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [tab, classId, date]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const markAbsent = async (teacherId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ substitutions: unknown[] }>(`/api/timetable/teachers/${teacherId}/absent`, {
        method: "POST",
        body: JSON.stringify({ date, reason: "Marked absent from UI" }),
      });
      setMessage(`Auto-substitutions generated: ${res.substitutions.length}`);
      await loadTab();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const revokeSub = async (id: string) => {
    await apiFetch(`/api/timetable/substitutions/${id}`, { method: "DELETE" });
    await loadTab();
  };

  const generate = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await apiFetch<{ generated: number }>("/api/timetable/generate", {
        method: "POST",
        body: JSON.stringify({
          class_id: classId,
          periods_per_day: periodsPerDay,
          working_days: workingDays,
          subjects: genSubjects,
          overwrite: true,
        }),
      });
      setMessage(`Generated ${res.generated} slots ✓`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = (n: number) => periods.find((p) => p.periodNumber === n);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Resource &amp; Timetable Scheduler</h2>
        <p className="text-sm text-slate-500">
          Live schedules, master grid, CSP auto-generation with teacher/room conflict detection.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.section ?? ""}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        {message && <span className="text-sm font-semibold text-blue-700">{message}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t ? "bg-[#0f2a43] text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Live Schedule" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Teacher</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Substitution</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s) => {
                const pc = periodLabel(s.period_number);
                return (
                  <tr key={s.period_number} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold">{s.period_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{pc ? `${pc.startTime}–${pc.endTime}` : "—"}</td>
                    <td className="px-4 py-3 font-semibold">{s.subject}</td>
                    <td className="px-4 py-3">{s.teacher_name}</td>
                    <td className="px-4 py-3 text-xs">{s.room_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {s.substitution ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {s.substitution.substitute_name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {schedule.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No periods scheduled for this day.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Master Grid" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {master.map((m, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{m.day_of_week}</td>
                  <td className="px-4 py-3">{m.period_number}</td>
                  <td className="px-4 py-3">{m.subject}</td>
                  <td className="px-4 py-3">{m.teacher_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Auto-Generator" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Periods/day:
              <input
                type="number"
                min={1}
                max={8}
                value={periodsPerDay}
                onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <div className="flex gap-1">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setWorkingDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                  }
                  className={`rounded px-2.5 py-1 text-xs font-bold ${
                    workingDays.includes(d) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {genSubjects.map((s, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  value={s.name}
                  onChange={(e) =>
                    setGenSubjects((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Subject"
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={s.teacher_id}
                  onChange={(e) =>
                    setGenSubjects((prev) => prev.map((x, j) => (j === i ? { ...x, teacher_id: e.target.value } : x)))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={s.periods_per_week}
                  onChange={(e) =>
                    setGenSubjects((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, periods_per_week: Number(e.target.value) } : x)),
                    )
                  }
                  className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <span className="self-center text-xs text-slate-400">periods/week</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Total: {genSubjects.reduce((a, s) => a + s.periods_per_week, 0)} periods needed ·{" "}
            {workingDays.length * periodsPerDay} slots available — these must match.
          </p>

          <button
            onClick={generate}
            disabled={loading}
            className="rounded-lg bg-purple-700 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-800"
          >
            ⚡ Generate Timetable
          </button>
        </div>
      )}

      {tab === "Manage Teachers" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Subjects</th>
                <th className="px-4 py-3">Max/Day</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{t.name}</td>
                  <td className="px-4 py-3 text-xs">{t.subjects ?? "—"}</td>
                  <td className="px-4 py-3">{t.maxPeriodsPerDay}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => markAbsent(t.id)}
                      className="rounded bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      Mark Absent (auto-sub)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Substitutions" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Original</th>
                <th className="px-4 py-3">Substitute</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{s.class_name}</td>
                  <td className="px-4 py-3">{s.period_number}</td>
                  <td className="px-4 py-3 text-xs">{s.original_teacher_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {s.substitute_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.reason ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => revokeSub(s.id)} className="rounded bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {subs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No substitutions for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p className="text-center text-sm text-slate-400">Loading…</p>}
    </div>
  );
}
