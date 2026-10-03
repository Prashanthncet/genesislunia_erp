"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, Tabs, useToast } from "@/components/ui";

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
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|failed/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

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
      <Reveal>
        <PageHeader
          icon="timetable"
          title="Resource & Timetable Scheduler"
          subtitle="Live schedules, master grid, CSP auto-generation with teacher/room conflict detection."
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Teachers" value={teachers.length} tone="brand" icon="staff" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Rooms" value={rooms.length} tone="teal" icon="hostel" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Periods Today" value={schedule.length} tone="violet" icon="timetable" hint={date} />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Substitutions" value={subs.length} tone="amber" icon="staff" />
        </Reveal>
      </div>

      <Reveal delay={60}>
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class" className="field w-auto">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.section ?? ""}
              </option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="field w-auto tnum" />
        </div>
      </Reveal>

      <Reveal delay={80}>
        <Tabs value={tab} onChange={setTab} tabs={TABS.map((t) => ({ id: t, label: t }))} />
      </Reveal>

      {tab === "Live Schedule" && (
        <div key="live" className="card overflow-x-auto" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <table className="w-full text-sm">
            <thead className="table-head">
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
                  <tr key={s.period_number} className="row-hover border-t border-slate-100" style={{ animation: "slide-right 0.4s var(--ease-out-soft) both" }}>
                    <td className="px-4 py-3 font-bold tnum">{s.period_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 tnum">{pc ? `${pc.startTime}–${pc.endTime}` : "—"}</td>
                    <td className="px-4 py-3 font-semibold">{s.subject}</td>
                    <td className="px-4 py-3">{s.teacher_name}</td>
                    <td className="px-4 py-3 text-xs">{s.room_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {s.substitution ? (
                        <Badge tone="amber">{s.substitution.substitute_name}</Badge>
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
        <div key="master" className="card overflow-x-auto" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {master.map((m, i) => (
                <tr key={i} className="row-hover border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{m.day_of_week}</td>
                  <td className="px-4 py-3 tnum">{m.period_number}</td>
                  <td className="px-4 py-3">{m.subject}</td>
                  <td className="px-4 py-3">{m.teacher_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Auto-Generator" && (
        <div key="gen" className="card space-y-4 p-5" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Periods/day:
              <input
                type="number"
                min={1}
                max={8}
                value={periodsPerDay}
                onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
                className="field w-20 shrink-0"
              />
            </label>
            <div className="flex gap-1" role="group" aria-label="Working days">
              {DAYS.map((d) => (
                <button
                  key={d}
                  aria-pressed={workingDays.includes(d)}
                  onClick={() =>
                    setWorkingDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                  }
                  className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 ${
                    workingDays.includes(d)
                      ? "bg-brand-600 text-white shadow-soft"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
                  className="field w-40"
                />
                <select
                  aria-label={`Teacher for ${s.name}`}
                  value={s.teacher_id}
                  onChange={(e) =>
                    setGenSubjects((prev) => prev.map((x, j) => (j === i ? { ...x, teacher_id: e.target.value } : x)))
                  }
                  className="field w-auto"
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
                  className="field w-20"
                />
                <span className="self-center text-xs text-slate-400">periods/week</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Total: {genSubjects.reduce((a, s) => a + s.periods_per_week, 0)} periods needed ·{" "}
            {workingDays.length * periodsPerDay} slots available — these must match.
          </p>

          <Button variant="accent" onClick={generate} loading={loading}>
            <Icon name="spark" className="h-4 w-4" /> Generate Timetable
          </Button>
        </div>
      )}

      {tab === "Manage Teachers" && (
        <div key="teachers" className="card overflow-x-auto" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Subjects</th>
                <th className="px-4 py-3">Max/Day</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="row-hover border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{t.name}</td>
                  <td className="px-4 py-3 text-xs">{t.subjects ?? "—"}</td>
                  <td className="px-4 py-3 tnum">{t.maxPeriodsPerDay}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => markAbsent(t.id)}
                      className="btn-soft !px-3 !py-1 text-xs"
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
        <div key="subs" className="card overflow-x-auto" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <table className="w-full text-sm">
            <thead className="table-head">
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
                <tr key={s.id} className="row-hover border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{s.class_name}</td>
                  <td className="px-4 py-3 tnum">{s.period_number}</td>
                  <td className="px-4 py-3 text-xs">{s.original_teacher_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone="amber">{s.substitute_name}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.reason ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => revokeSub(s.id)} className="btn-danger !px-3 !py-1 text-xs">
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
