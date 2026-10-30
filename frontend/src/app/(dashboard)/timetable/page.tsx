"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { confirmAction } from "@/components/confirm";
import { Badge, Button, Field, Icon, Input, Modal, PageHeader, Reveal, StatCard, Tabs, useToast } from "@/components/ui";
import { DayView } from "@/components/timetable/DayView";

import { TableView } from "@/components/TableView";
import { MobileFilters } from "@/components/mobile/MobileFilters";
import { WeekGrid, orderPeriods } from "@/components/WeekGrid";
import { R, ROLE, hasRole, isPortal, useMe } from "@/lib/auth";
import { MyDayView } from "@/components/timetable/MyDayView";
import { TeacherWeekView } from "@/components/timetable/TeacherWeekView";
import { SubstitutionDesk } from "@/components/timetable/SubstitutionDesk";
import { CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Chip, Meter, Monogram, RecordCard, StatusPill, initials, toneClasses, toneFor } from "@/components/RecordCard";
type ClassItem = { id: string; name: string; section: string | null };
type Teacher = {
  id: string; name: string; email: string | null; subjects: string | null; isActive: boolean; maxPeriodsPerDay: number;
  /** Classes this teacher is timetabled in, with the subject they take there. */
  classes?: { class_id: string; class_label: string; subject: string }[];
};
type Room = { id: string; name: string; type: string; capacity: number };
type PeriodConfig = { id: string; periodNumber: number; startTime: string; endTime: string; isBreak: boolean; breakName: string | null };
type Slot = { period_number: number; subject: string; teacher_name: string; room_name: string | null; cover_requested?: boolean; substitution: { substitute_name: string; reason: string | null } | null };
type MasterSlot = { day_of_week: string; period_number: number; subject: string; teacher_name: string; room_name?: string | null };
type Substitution = { id: string; class_name: string; period_number: number; original_teacher_name: string | null; substitute_name: string; reason: string | null };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_TABS = ["My Day", "Live Schedule", "Master Grid", "Teacher Grid", "Substitutions", "Auto-Generator", "Manage Teachers"] as const;
type TabName = (typeof ALL_TABS)[number];
const TAB_ICON: Record<TabName, string> = {
  "My Day": "user", "Live Schedule": "clock", "Master Grid": "calendar", "Teacher Grid": "grid",
  "Substitutions": "alert", "Auto-Generator": "refresh", "Manage Teachers": "students",
};

export default function TimetablePage() {
  const { me, loading: meLoading } = useMe();
  const portal = isPortal(me);
  const isAdmin = hasRole(me, R.TIMETABLE_ADMIN);
  const canRequest = hasRole(me, R.TEACHING) && !!me?.staff;
  const myStaffId = me?.staff?.id ?? null;
  // Portal users only see their class grid; staff get the teacher views; admins also edit.
  const TABS: TabName[] = portal
    ? ["Master Grid", "Live Schedule"]
    : [
        ...(myStaffId ? (["My Day"] as TabName[]) : []),
        "Live Schedule", "Master Grid", "Teacher Grid", "Substitutions",
        ...(isAdmin ? (["Auto-Generator", "Manage Teachers"] as TabName[]) : []),
      ];
  const [tabState, setTab] = useState<TabName | null>(null);
  const tab: TabName = tabState && TABS.includes(tabState) ? tabState : TABS[0];
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
  // The freshly generated week, shown right under the generator so the admin sees the result.
  const [preview, setPreview] = useState<MasterSlot[] | null>(null);
  const [subs, setSubs] = useState<Substitution[]>([]);
  const [masterView, setMasterView] = useState<"week" | "day">("week");
  const [downloading, setDownloading] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<string[]>([]);
  const [customSubject, setCustomSubject] = useState("");
  const [schoolSubjects, setSchoolSubjects] = useState<string[]>([
    "Mathematics", "English", "Science", "Physics", "Chemistry", "Biology", "Hindi", "Sanskrit", "Social Studies", "History", "Geography", "Computer Science", "Physical Drill",
  ]);
  const [maxPeriodsDraft, setMaxPeriodsDraft] = useState(6);
  const [slotClassId, setSlotClassId] = useState("");
  const [slotDay, setSlotDay] = useState("Mon");
  const [slotPeriod, setSlotPeriod] = useState(1);
  const [slotSubject, setSlotSubject] = useState("Mathematics");
  const [slotRoomId, setSlotRoomId] = useState("");
  const [slotSaving, setSlotSaving] = useState(false);
  const [showQuickSlotModal, setShowQuickSlotModal] = useState(false);
  const [quickTeacherId, setQuickTeacherId] = useState("");

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
    if (meLoading) return;
    setLoading(true);
    try {
      // Teachers and rooms are staff-only; parents/students just need periods + their classes.
      const [t, r, p, c] = await Promise.all([
        portal ? Promise.resolve([] as Teacher[]) : apiFetch<Teacher[]>("/api/timetable/teachers"),
        portal ? Promise.resolve([] as Room[]) : apiFetch<Room[]>("/api/timetable/rooms"),
        apiFetch<PeriodConfig[]>("/api/timetable/periods"),
        apiFetch<ClassItem[]>("/api/timetable/classes"),
      ]);
      setTeachers(t ?? []);
      setRooms(r ?? []);
      setPeriods(p ?? []);
      setClasses(c ?? []);
      if (c?.length) setSelectedClass(c[0].id);
      if (!portal) {
        apiFetch<{ name: string }[]>("/api/academics/subjects")
          .then((subs) => {
            if (Array.isArray(subs) && subs.length > 0) {
              setSchoolSubjects((prev) => Array.from(new Set([...subs.map((s) => s.name), ...prev])));
            }
          })
          .catch(() => undefined);
      }
    } catch {
      setMessage("Failed to load timetable data");
    } finally {
      setLoading(false);
    }
  }, [meLoading, portal]);

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
      }
      if (!portal) setSubs(await apiFetch<Substitution[]>(`/api/timetable/substitutions?date=${date}`));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [tab, selectedClass, date, portal]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  // A preview belongs to one class — drop it when the admin switches class.
  useEffect(() => setPreview(null), [selectedClass]);

  const openAssignSubjects = (t: Teacher) => {
    const current = (t.subjects ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    setEditingTeacher(t);
    setSubjectDraft(current);
    setCustomSubject("");
    setMaxPeriodsDraft(t.maxPeriodsPerDay ?? 6);
    setSlotClassId(selectedClass || classes[0]?.id || "");
    setSlotDay("Mon");
    setSlotPeriod(1);
    setSlotSubject(current[0] || schoolSubjects[0] || "Mathematics");
    setSlotRoomId("");
  };

  const toggleDraftSubject = (subj: string) => {
    setSubjectDraft((prev) => (prev.includes(subj) ? prev.filter((x) => x !== subj) : [...prev, subj]));
  };

  const addCustomSubject = () => {
    const trimmed = customSubject.trim();
    if (!trimmed) return;
    if (!subjectDraft.includes(trimmed)) setSubjectDraft((prev) => [...prev, trimmed]);
    if (!schoolSubjects.includes(trimmed)) setSchoolSubjects((prev) => [...prev, trimmed]);
    setCustomSubject("");
  };

  const saveTeacherSubjects = async () => {
    if (!editingTeacher) return;
    setSaving(true);
    try {
      const nextSubjects = subjectDraft.join(", ");
      await apiFetch(`/api/timetable/teachers/${editingTeacher.id}`, {
        method: "PUT",
        body: JSON.stringify({ subjects: nextSubjects, max_periods_per_day: maxPeriodsDraft }),
      });
      setTeachers((prev) => prev.map((t) => (t.id === editingTeacher.id ? { ...t, subjects: nextSubjects || null, maxPeriodsPerDay: maxPeriodsDraft } : t)));
      setMessage(`Updated subjects & periods for ${editingTeacher.name}`);
      setEditingTeacher(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to update subjects");
    } finally {
      setSaving(false);
    }
  };

  const assignTeacherPeriodSlot = async () => {
    if (!editingTeacher || !slotClassId || !slotSubject.trim()) return;
    setSlotSaving(true);
    try {
      await apiFetch("/api/timetable/slot", {
        method: "PUT",
        body: JSON.stringify({
          class_id: slotClassId,
          day_of_week: slotDay,
          period_number: Number(slotPeriod),
          subject_name: slotSubject.trim(),
          teacher_id: editingTeacher.id,
          ...(slotRoomId ? { room_id: slotRoomId } : {}),
        }),
      });
      if (!subjectDraft.includes(slotSubject.trim())) {
        setSubjectDraft((prev) => [...prev, slotSubject.trim()]);
      }
      await loadTabData();
      setMessage(`Assigned ${editingTeacher.name} to ${slotSubject.trim()} (${slotDay} · Period ${slotPeriod})`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to assign timetable period");
    } finally {
      setSlotSaving(false);
    }
  };

  const markAbsent = async (teacherId: string) => {
    const name = teachers.find((t) => t.id === teacherId)?.name ?? "this teacher";
    if (!(await confirmAction({
      title: `Mark ${name} absent on ${date}?`,
      text: "Substitutes are auto-assigned for all of their lessons that day.",
      confirmText: "Mark absent",
      tone: "primary",
    }))) return;
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

  const generate = async () => {
    if (!selectedClass) return;
    if (!(await confirmAction({
      title: `Generate a new timetable for ${selectedClassLabel || "this class"}?`,
      text: "This replaces the class's entire current weekly timetable. This cannot be undone.",
      confirmText: "Replace timetable",
      tone: "danger",
    }))) return;
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
      // Load what was actually saved, so the preview is the real timetable.
      const week = await apiFetch<MasterSlot[]>(`/api/timetable/master/${selectedClass}`);
      setPreview(week);
      setMaster(week);
      setMessage(`Generated ${res.generated} timetable slots ✓ — preview below`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setSaving(false);
    }
  };

  const periodLabel = (n: number) => periods.find((p) => p.periodNumber === n);
  const selectedClassLabel = (() => {
    const c = classes.find((x) => x.id === selectedClass);
    return c ? `${c.name}${c.section ? ` ${c.section}` : ""}` : "";
  })();
  const today = new Date(`${date}T00:00:00Z`);
  const dayName = today.getUTCDay() === 0 ? "Sun" : DAYS[today.getUTCDay() - 1];
  const onError = useCallback((m: string) => setMessage(m), []);

  // Live schedule rows: lessons plus configured breaks, in bell order (by start time).
  const bellOrder = new Map(orderPeriods(periods).map((p, i) => [p.periodNumber, i]));
  const liveRows: Array<{ n: number; slot: Slot | null }> = [
    ...schedule.map((s) => ({ n: s.period_number, slot: s })),
    ...periods.filter((p) => p.isBreak && !schedule.some((s) => s.period_number === p.periodNumber)).map((p) => ({ n: p.periodNumber, slot: null })),
  ].sort((a, b) => (bellOrder.get(a.n) ?? 100 + a.n) - (bellOrder.get(b.n) ?? 100 + b.n));

  const downloadClassPdf = async () => {
    if (!selectedClass) return;
    setDownloading(true);
    try {
      await apiDownload(`/api/timetable/class/${selectedClass}/pdf`, `timetable-${selectedClassLabel || "class"}.pdf`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  /** Card view: a period card — the period number is the anchor, coloured by subject, so a week scans like a timetable. */
  const masterCards = (
    <CardGrid min="15rem" empty={<CardEmpty title="No master grid data" hint="Generate a timetable for this class to fill the grid." icon="calendar" />}>
      {master.map((m, idx) => {
        const tone = toneFor(m.subject);
        const t = toneClasses(tone);
        const period = periodLabel(m.period_number);
        return (
          <RecordCard key={idx} className="!flex-row">
            <div className={`flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 ${t.solid} py-4 text-white`}>
              <span className="tnum text-[22px] font-bold leading-none">P{m.period_number}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-85">{m.day_of_week.slice(0, 3)}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-3.5">
              <h3 className="truncate text-[15px] font-semibold leading-snug text-ink">{m.subject}</h3>
              <div className="flex min-w-0 items-center gap-2">
                <Monogram text={initials(m.teacher_name)} tone="slate" size="sm" shape="circle" />
                <span className="truncate text-[12.5px] text-ink-2">{m.teacher_name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip icon="door">Room {m.room_name ?? "—"}</Chip>
                {period && <Chip icon="clock">{period.startTime}–{period.endTime}</Chip>}
              </div>
            </div>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  /** Card view: a teacher load card — who they are, what they teach, and how heavy their day can get. */
  const teacherCards = (
    <CardGrid min="18rem" empty={<CardEmpty title="No teachers found" hint="Teachers added to the timetable module will appear here." icon="staff" />}>
      {teachers.map((t) => {
        const subjects = (t.subjects ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const classes = t.classes ?? [];
        const loadTone = t.maxPeriodsPerDay >= 7 ? "warn" : t.maxPeriodsPerDay >= 5 ? "navy" : "teal";
        return (
          <RecordCard key={t.id} rail={t.isActive ? "ok" : "slate"}>
            <CardBody>
              <CardTitle
                lead={<Monogram text={initials(t.name)} tone={toneFor(t.name)} solid />}
                title={t.name}
                subtitle={t.email ?? `${subjects.length} subject${subjects.length === 1 ? "" : "s"}`}
                aside={<StatusPill status={t.isActive ? "Active" : "Inactive"} tone={t.isActive ? "ok" : "slate"} />}
              />
              <div className="flex flex-wrap gap-1.5">
                {subjects.length > 0
                  ? subjects.map((s) => <Chip key={s} tone={toneFor(s)} icon="book">{s}</Chip>)
                  : <Chip>No subjects assigned</Chip>}
              </div>
              {/* Subject + class pairs come from the timetable itself, so the card shows
                  where each subject is actually taught, not just the free-text subjects. */}
              {classes.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
                  <span className="flex items-center gap-1.5 font-semibold text-ink-3">
                    <Icon name="layers" className="h-3.5 w-3.5" /> Classes
                  </span>
                  {classes.map((c) => (
                    <span key={`${c.class_id}-${c.subject}`} className="rounded-md bg-surface-2 px-1.5 py-0.5 ring-1 ring-line">
                      {c.subject} · <strong className="font-semibold text-ink">{c.class_label}</strong>
                    </span>
                  ))}
                </div>
              )}
              <Meter value={t.maxPeriodsPerDay} max={8} tone={loadTone} label="Max periods / day" caption={`${t.maxPeriodsPerDay} / 8`} />
            </CardBody>
            {isAdmin && <CardFooter>
              <Button size="sm" variant="ghost" onClick={() => openAssignSubjects(t)} aria-label={`Assign subjects to ${t.name}`}>
                <Icon name="book" className="h-3.5 w-3.5" /> Assign Subjects
              </Button>
              <Button size="sm" variant="soft" onClick={() => markAbsent(t.id)} aria-label={`Mark ${t.name} absent`}>
                <Icon name="clock" className="h-3.5 w-3.5" /> Mark Absent
              </Button>
            </CardFooter>}
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-accent-500/10 to-brand-700/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-tl from-warn/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 border-b border-line bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4 max-md:flex-col max-md:items-start max-md:gap-3 max-md:px-4 max-md:py-3">
          <PageHeader
            icon="timetable"
            title="Timetable & Scheduling"
            subtitle={portal ? "Your class timetable for the week and the day" : "Class and teacher timetables, today's schedule and substitutions"}
          />
          <Button variant="soft" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
            <Icon name="refresh" className="h-4 w-4" /> Today
          </Button>
        </div>

        <div className="flex items-center gap-2 px-6 overflow-x-auto max-md:gap-1 max-md:px-4 m-scroll-x">
          {TABS.map((t, idx) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap max-md:min-h-11 max-md:shrink-0 max-md:gap-2 max-md:px-3 max-md:py-2.5 max-md:snap-start ${tab === t ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-100" : "text-ink-2 hover:bg-slate-100"}`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <Icon name={TAB_ICON[t]} className="h-4 w-4" />
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 p-6 space-y-6 max-md:space-y-4 max-md:px-0 max-md:py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5 max-md:grid-cols-2 max-md:gap-3">
          <Reveal delay={0}>
            <div className="rounded-xl bg-brand-900 p-5 text-white shadow-xl max-md:p-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon name="students" className="h-5 w-5 text-ink-2" />
                <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">Teachers</span>
              </div>
              <p className="text-3xl font-bold max-md:text-2xl">{teachers.length}</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-xl bg-brand-50 border border-brand-200 p-5 max-md:p-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon name="mapPin" className="h-5 w-5 text-accent-600" />
                <span className="text-xs font-medium text-accent-600 uppercase tracking-wide">Rooms</span>
              </div>
              <p className="text-3xl font-bold max-md:text-2xl text-brand-700">{rooms.length}</p>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="rounded-xl bg-accent-50 border border-accent-200 p-5 max-md:p-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon name="clock" className="h-5 w-5 text-accent-700" />
                <span className="text-xs font-medium text-accent-700 uppercase tracking-wide">Periods Today</span>
              </div>
              <p className="text-3xl font-bold max-md:text-2xl text-accent-700">{schedule.length}</p>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="rounded-xl bg-warn-soft border border-warn-line p-5 max-md:p-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon name="alert" className="h-5 w-5 text-warn" />
                <span className="text-xs font-medium text-warn uppercase tracking-wide">Substitutions</span>
              </div>
              <p className="text-3xl font-bold max-md:text-2xl text-warn-ink">{subs.length}</p>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <div className="rounded-xl bg-surface-2 border border-line p-5 max-md:p-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon name="calendar" className="h-5 w-5 text-ink-2" />
                <span className="text-xs font-medium text-ink-2 uppercase tracking-wide">{dayName}</span>
              </div>
              <p className="text-xl font-bold text-ink-2">{date}</p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-white border border-line shadow-sm max-md:gap-3">
            {/* Phones: class + date move into a sheet; the button names the class being shown. */}
            <div className="contents max-md:flex max-md:min-w-0 max-md:flex-1">
            <MobileFilters
              label={selectedClassLabel || "Class & date"}
              active={(classes.length > 0 && selectedClass !== classes[0].id ? 1 : 0) + (date !== new Date().toISOString().split("T")[0] ? 1 : 0)}
            >
            <div className="relative flex-1 min-w-[200px] max-md:min-w-full">
              <select
                aria-label="Class"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full appearance-none rounded-lg border border-line-strong bg-surface-2 pl-4 pr-10 py-2.5 text-sm text-ink-2 focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20 max-md:min-h-11"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                ))}
              </select>
            </div>
            <div className="relative max-md:min-w-0 max-md:flex-1">
              <input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="appearance-none rounded-lg border border-line-strong bg-surface-2 px-4 py-2.5 pr-10 text-sm text-ink-2 focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20 max-md:min-h-11 max-md:w-full max-md:pr-4" />
            </div>
            </MobileFilters>
            </div>
            <Button variant="primary" onClick={loadTabData} loading={loading} className="shadow-lg shadow-brand-700/20">
              <Icon name="refresh" className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </Reveal>

        <Reveal delay={150}>
          {tab === "My Day" && <MyDayView date={date} onError={onError} />}

          {tab === "Teacher Grid" && (
            <TeacherWeekView
              teachers={teachers}
              periods={periods}
              date={date}
              defaultTeacherId={hasRole(me, [ROLE.TEACHER, ROLE.HOD]) ? myStaffId : null}
              onError={onError}
              canDownload={(id) => isAdmin || id === myStaffId}
            />
          )}

          {tab === "Live Schedule" && (
            <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
              <div className="grid grid-cols-[60px_80px_1.5fr_1.5fr_1fr_1fr] gap-4 px-6 py-4 bg-surface-2/50 border-b border-line max-md:hidden">
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Period</div>
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Time</div>
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Subject</div>
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Teacher</div>
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Room</div>
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Status</div>
              </div>
              <div className="divide-y divide-line">
                {liveRows.map(({ n, slot }, idx) => {
                  const period = periodLabel(n);
                  if (!slot) {
                    return (
                      <div key={`b${n}`} className="bg-surface-2 px-6 py-2 max-md:px-4 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                        {period?.breakName ?? "Break"} · {period?.startTime}–{period?.endTime}
                      </div>
                    );
                  }
                  const hasSub = slot.substitution !== null;
                  return (
                    <div key={idx} className="grid grid-cols-[60px_80px_1.5fr_1.5fr_1fr_1fr] gap-4 px-6 py-4 items-center transition-all duration-200 hover:bg-surface-2 group max-md:grid-cols-[2.75rem_minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3" style={{ animation: `fade-in 0.3s ease-out ${idx * 50}ms both`, animationName: "fade-in" }}>
                      <div className="flex flex-col items-center max-md:col-start-1 max-md:row-span-3 max-md:row-start-1 max-md:self-start">
                        <span className="font-bold text-ink">{slot.period_number}</span>
                        <span className="text-[10px] text-ink-3 max-md:text-[11px]">{period?.isBreak ? "Break" : "Period"}</span>
                      </div>
                      <div className="text-sm text-ink-2 font-mono max-md:col-start-2 max-md:row-start-2 max-md:text-[12px]">{period ? `${period.startTime} - ${period.endTime}` : "--:--"}</div>
                      <div className="font-semibold text-ink max-md:col-start-2 max-md:row-start-1 max-md:min-w-0 max-md:truncate">{slot.subject}</div>
                      <div className="flex items-center gap-2 max-md:col-span-2 max-md:col-start-2 max-md:row-start-3 max-md:min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-brand-900 text-white text-xs font-bold flex items-center justify-center max-md:h-6 max-md:w-6 max-md:shrink-0 max-md:text-[11px]">
                          {slot.teacher_name.charAt(0)}
                        </div>
                        <span className="text-sm text-ink-2 max-md:truncate">{slot.teacher_name}</span>
                      </div>
                      <div className="text-sm text-ink-2 max-md:col-start-3 max-md:row-start-2 max-md:text-right max-md:text-[12px]">{slot.room_name || "--"}</div>
                      <div className="flex justify-center max-md:col-start-3 max-md:row-start-1 max-md:justify-end">
                        {slot.cover_requested ? (
                          <Badge tone="amber" className="px-3 py-1.5">Cover requested</Badge>
                        ) : hasSub ? (
                          <Badge tone="amber" className="px-3 py-1.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-warn" />
                            {slot.substitution?.substitute_name}
                          </Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ok-soft text-ok-ink text-xs font-medium">
                            <span className="w-2 h-2 rounded-full bg-ok" />
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
                      <Icon name="clock" className="h-8 w-8 text-ink-3" />
                    </div>
                    <p className="text-sm font-medium text-ink-2">No schedule for this day</p>
                    <p className="text-xs text-ink-3 mt-1">Generate timetable to see schedule</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "Master Grid" && (
            <div className="space-y-4">
            <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[16px] font-semibold text-ink">{masterView === "week" ? "Week view" : "Day view"}</h3>
                  <p className="text-[12.5px] text-ink-3">
                    {selectedClassLabel || "Selected class"} · {master.length} periods scheduled · breaks shown in bell order
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs tabs={[{ id: "week", label: "Week" }, { id: "day", label: "Day view" }] as const} value={masterView} onChange={setMasterView} />
                  <Button size="sm" variant="soft" onClick={downloadClassPdf} loading={downloading} disabled={!selectedClass}>
                    <Icon name="download" className="h-4 w-4" /> Download PDF
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setSlotClassId(selectedClass);
                        setQuickTeacherId(teachers[0]?.id ?? "");
                        setShowQuickSlotModal(true);
                      }}
                    >
                      <Icon name="edit" className="h-4 w-4" /> Quick Assign / Swap Slot
                    </Button>
                  )}
                </div>
              </div>
              {masterView === "week" ? (
                <WeekGrid slots={master} periods={periods} days={DAYS} />
              ) : (
                <DayView
                  periods={periods}
                  entries={master.map((m) => ({ day_of_week: m.day_of_week, period_number: m.period_number, subject: m.subject, secondary: m.teacher_name, room_name: m.room_name ?? null }))}
                  emptyText="No timetable yet for this class."
                />
              )}
            </div>
            <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <TableView id="t1" cards={masterCards}>
                <table className="w-full text-sm">
                  <thead className="bg-surface-2/50 border-b border-line">
                    <tr style={{ animation: "fade-in 0.3s ease-out both", animationName: "fade-in" }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Day</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Period</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Teacher</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {master.map((m, idx) => (
                      <tr
                        key={idx}
                        onClick={() => {
                          if (!isAdmin) return;
                          setSlotClassId(selectedClass);
                          setSlotDay(m.day_of_week);
                          setSlotPeriod(m.period_number);
                          setSlotSubject(m.subject);
                          const matchedTeacher = teachers.find((t) => t.name === m.teacher_name);
                          setQuickTeacherId(matchedTeacher?.id ?? teachers[0]?.id ?? "");
                          setShowQuickSlotModal(true);
                        }}
                        className={`hover:bg-surface-2 transition-colors ${isAdmin ? "cursor-pointer" : ""}`}
                        style={{ animation: `fade-in 0.3s ease-out ${idx * 30}ms both`, animationName: "fade-in" }}
                      >
                        <td className="px-4 py-3 font-semibold text-ink">{m.day_of_week}</td>
                        <td className="px-4 py-3 text-ink-2 font-mono">{m.period_number}</td>
                        <td className="px-4 py-3">{m.subject}</td>
                        <td className="px-4 py-3">{m.teacher_name}</td>
                        <td className="px-4 py-3 text-ink-2">{m.room_name ?? "—"}</td>
                      </tr>
                    ))}
                    {master.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-ink-3">
                          No master grid data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </TableView>
              </div>
            </div>
            </div>
          )}

          {tab === "Auto-Generator" && (
            <div className="rounded-xl border border-line bg-white shadow-sm p-6 space-y-6 max-md:space-y-5 max-md:p-4">
              <h3 className="font-semibold text-ink text-lg">Timetable Auto-Generator</h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ink-2 mb-2">Periods per Day</label>
                  <input
                    type="number" min={1} max={10}
                    value={periodsPerDay} onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
                    className="w-full rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-sm text-ink-2 focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-2 mb-2">Working Days</label>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setWorkingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 max-md:min-h-11 max-md:min-w-12 max-md:px-3 ${workingDays.includes(d) ? "bg-brand-700 text-white shadow-md" : "bg-slate-100 text-ink-2 hover:bg-line"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">Subject Allocation</label>
                <div className="space-y-3">
                  {genSubjects.map((subj, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-surface-2">
                      <input
                        value={subj.name}
                        onChange={(e) => setGenSubjects(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                        placeholder="Subject"
                        className="flex-1 min-w-[150px] rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink-2 focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20 max-md:min-h-11 max-md:min-w-full"
                      />
                      <select
                        value={subj.teacher_id}
                        onChange={(e) => setGenSubjects(prev => prev.map((s, i) => i === idx ? { ...s, teacher_id: e.target.value } : s))}
                        className="flex-1 min-w-[150px] rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink-2 focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20 max-md:min-h-11 max-md:min-w-full"
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
                        className="w-20 rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink-2 text-center focus:border-brand-700 focus:ring-2 focus:ring-accent-500/20 max-md:min-h-11"
                      />
                      <span className="text-xs text-ink-2">periods/week</span>
                      <button
                        onClick={() => setGenSubjects(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg text-danger hover:bg-danger-soft transition-colors max-md:ml-auto max-md:grid max-md:h-11 max-md:w-11 max-md:place-items-center"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="soft" onClick={() => setGenSubjects(prev => [...prev, { name: "", teacher_id: "", periods_per_week: 3 }])} className="mt-3">
                  <Icon name="plus" className="h-4 w-4" /> Add Subject
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-surface-2 border border-line">
                <div className="flex items-center justify-between text-sm mb-2 max-md:flex-wrap max-md:gap-x-3">
                  <span className="font-medium text-ink-2">Summary</span>
                  <span className="text-ink-2">Required: {genSubjects.reduce((a, s) => a + s.periods_per_week, 0)} periods</span>
                </div>
                <div className="h-2 bg-line rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-700 to-accent-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (genSubjects.reduce((a, s) => a + s.periods_per_week, 0) / (workingDays.length * periodsPerDay)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-ink-2 mt-2">{workingDays.length} days × {periodsPerDay} periods = {workingDays.length * periodsPerDay} slots available</p>
              </div>

              <Button variant="primary" onClick={generate} loading={saving} className="w-full shadow-lg shadow-brand-700/20">
                <Icon name="refresh" className="h-4 w-4" /> Generate Timetable
              </Button>

              {preview && (
                <div className="space-y-3 border-t border-line pt-5" style={{ animation: "fade-up 0.35s var(--ease-soft) both" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-[16px] font-semibold text-ink">Preview — {selectedClassLabel || "selected class"}</h3>
                      <p className="text-[12.5px] text-ink-3">
                        {preview.length} periods saved. This is the live timetable students and teachers will see.
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setTab("Master Grid")}>
                      <Icon name="arrowUpRight" className="h-3.5 w-3.5" /> Open in Master Grid
                    </Button>
                  </div>
                  <WeekGrid slots={preview} periods={periods} days={workingDays} />
                </div>
              )}
            </div>
          )}

          {tab === "Manage Teachers" && (
            <div className="rounded-xl border border-line bg-white shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <TableView id="t2" cards={teacherCards}>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-2/70 border-b border-line">
                    <tr className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">
                      <th className="px-5 py-3.5 whitespace-nowrap">Teacher</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Subjects</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Max Periods/Day</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-center">Status</th>
                      <th className="px-5 py-3.5 whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-sm">
                    {teachers.map((t) => (
                      <tr key={t.id} className="hover:bg-surface-2/70 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 text-white text-xs font-bold flex items-center justify-center shadow-soft">
                              {t.name.charAt(0)}
                            </div>
                            <span className="font-semibold text-ink">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-ink-2">{t.subjects || "—"}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-ink-2 font-mono">{t.maxPeriodsPerDay}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-center">
                          <Badge tone={t.isActive ? "emerald" : "slate"} className="px-2.5 py-1">
                            {t.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <Button variant="ghost" disabled={!isAdmin} onClick={() => openAssignSubjects(t)} className="!px-3 !py-1.5">
                              <Icon name="book" className="h-3.5 w-3.5" /> Assign Subjects
                            </Button>
                            <Button variant="soft" disabled={!isAdmin} onClick={() => markAbsent(t.id)} className="!px-3 !py-1.5">
                              <Icon name="clock" className="h-3.5 w-3.5" /> Mark Absent
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {teachers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-ink-3">No teachers found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </TableView>
              </div>
            </div>
          )}

          {tab === "Substitutions" && (
            <SubstitutionDesk
              date={date}
              classes={classes}
              periods={periods}
              isAdmin={isAdmin}
              canRequest={canRequest}
              onMessage={onError}
            />
          )}
        </Reveal>
      </div>

      <Modal
        open={editingTeacher !== null}
        onClose={() => setEditingTeacher(null)}
        title={editingTeacher ? `Assign subjects — ${editingTeacher.name}` : "Assign subjects"}
        subtitle="Select subjects taught by this teacher or add a new subject."
        footer={
          <>
            <Button onClick={() => setEditingTeacher(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={saveTeacherSubjects} loading={saving}>
              <Icon name="check" className="h-4 w-4" /> Save subjects
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Available subjects</p>
            <div className="flex flex-wrap gap-2">
              {schoolSubjects.map((subj) => {
                const active = subjectDraft.includes(subj);
                return (
                  <button
                    key={subj}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDraftSubject(subj)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                      active
                        ? "bg-brand-700 text-white shadow-sm ring-1 ring-brand-700"
                        : "bg-surface-2 text-ink-2 ring-1 ring-line hover:bg-surface-3"
                    }`}
                  >
                    <Icon name={active ? "check" : "plus"} className="h-3.5 w-3.5" />
                    {subj}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Add custom subject" hint="Type a subject name and press Add to include it.">
            <div className="flex items-center gap-2">
              <Input
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSubject();
                  }
                }}
                placeholder="e.g. NDA Mathematics"
                aria-label="Custom subject"
              />
              <Button type="button" variant="soft" onClick={addCustomSubject} disabled={!customSubject.trim()}>
                <Icon name="plus" className="h-4 w-4" /> Add
              </Button>
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-2/60 p-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Assigned ({subjectDraft.length})</p>
              <p className="mt-1 text-[13px] font-medium text-ink">
                {subjectDraft.length > 0 ? subjectDraft.join(", ") : "No subjects selected"}
              </p>
            </div>
            <Field label="Max Periods / Day">
              <Input
                type="number"
                min={1}
                max={10}
                value={String(maxPeriodsDraft)}
                onChange={(e) => setMaxPeriodsDraft(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                aria-label="Max periods per day"
              />
            </Field>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Assign Teacher Subject &amp; Period Slot</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Field label="Class">
                <select
                  aria-label="Slot class"
                  value={slotClassId}
                  onChange={(e) => setSlotClassId(e.target.value)}
                  className="field !py-1.5 text-xs"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Day">
                <select
                  aria-label="Slot day"
                  value={slotDay}
                  onChange={(e) => setSlotDay(e.target.value)}
                  className="field !py-1.5 text-xs"
                >
                  {DAYS.slice(0, 6).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field label="Period">
                <select
                  aria-label="Slot period"
                  value={String(slotPeriod)}
                  onChange={(e) => setSlotPeriod(Number(e.target.value))}
                  className="field !py-1.5 text-xs"
                >
                  {(periods.filter((p) => !p.isBreak).length > 0
                    ? periods.filter((p) => !p.isBreak).map((p) => p.periodNumber)
                    : [1, 2, 3, 4, 5, 6, 7, 8]
                  ).map((n) => (
                    <option key={n} value={n}>Period {n}</option>
                  ))}
                </select>
              </Field>
              <Field label="Subject">
                <select
                  aria-label="Slot subject"
                  value={slotSubject}
                  onChange={(e) => setSlotSubject(e.target.value)}
                  className="field !py-1.5 text-xs"
                >
                  {Array.from(new Set([...subjectDraft, ...schoolSubjects])).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                aria-label="Slot room"
                value={slotRoomId}
                onChange={(e) => setSlotRoomId(e.target.value)}
                className="field !w-auto !py-1.5 text-xs"
              >
                <option value="">Room (optional)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button type="button" size="sm" variant="soft" loading={slotSaving} onClick={assignTeacherPeriodSlot}>
                <Icon name="plus" className="h-3.5 w-3.5" /> Assign Period Slot
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={showQuickSlotModal}
        onClose={() => setShowQuickSlotModal(false)}
        title={`Quick Assign / Swap Timetable Slot — ${selectedClassLabel || "Class"}`}
        subtitle="Select a day, period, subject, and teacher to assign or swap directly in the Master Grid."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowQuickSlotModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={slotSaving}
              disabled={!quickTeacherId || !slotSubject.trim() || !(slotClassId || selectedClass)}
              onClick={async () => {
                const targetClass = slotClassId || selectedClass;
                if (!targetClass || !quickTeacherId) return;
                setSlotSaving(true);
                try {
                  await apiFetch("/api/timetable/slot", {
                    method: "PUT",
                    body: JSON.stringify({
                      class_id: targetClass,
                      day_of_week: slotDay,
                      period_number: Number(slotPeriod),
                      subject_name: slotSubject.trim(),
                      teacher_id: quickTeacherId,
                      ...(slotRoomId ? { room_id: slotRoomId } : {}),
                    }),
                  });
                  await loadTabData();
                  setShowQuickSlotModal(false);
                  setMessage(`Updated ${slotDay} Period ${slotPeriod} → ${slotSubject.trim()}`);
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "Failed to update slot");
                } finally {
                  setSlotSaving(false);
                }
              }}
            >
              <Icon name="check" className="h-4 w-4" /> Save Timetable Slot
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Day of Week">
              <select aria-label="Quick slot day" value={slotDay} onChange={(e) => setSlotDay(e.target.value)} className="field">
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Period">
              <select aria-label="Quick slot period" value={String(slotPeriod)} onChange={(e) => setSlotPeriod(Number(e.target.value))} className="field">
                {(periods.filter((p) => !p.isBreak).length > 0
                  ? periods.filter((p) => !p.isBreak).map((p) => p.periodNumber)
                  : [1, 2, 3, 4, 5, 6, 7, 8]
                ).map((n) => (
                  <option key={n} value={n}>Period {n}</option>
                ))}
              </select>
            </Field>
            <Field label="Room (Optional)">
              <select aria-label="Quick slot room" value={slotRoomId} onChange={(e) => setSlotRoomId(e.target.value)} className="field">
                <option value="">Default room</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Subject" required>
            <select aria-label="Quick slot subject" value={slotSubject} onChange={(e) => setSlotSubject(e.target.value)} className="field">
              {schoolSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Assign Teacher (with Live Load Indicator)" required>
            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-surface-2/40 p-2">
              {teachers.map((t) => {
                const currentSlotMatch = master.find((m) => m.day_of_week === slotDay && m.period_number === slotPeriod && m.teacher_name === t.name);
                const dayCount = master.filter((m) => m.day_of_week === slotDay && m.teacher_name === t.name).length;
                const active = quickTeacherId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setQuickTeacherId(t.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                      active ? "border-brand-600 bg-brand-50 font-semibold text-brand-900 ring-1 ring-brand-500" : "border-line bg-surface hover:bg-surface-2"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{t.name}</p>
                      <p className="truncate text-[11px] text-ink-3">{t.subjects || "General"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {currentSlotMatch ? (
                        <Badge tone="violet">Current slot</Badge>
                      ) : (
                        <Badge tone={dayCount >= t.maxPeriodsPerDay ? "rose" : "emerald"}>
                          {dayCount}/{t.maxPeriodsPerDay} periods on {slotDay}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Modal>
      <Modal open={false} onClose={() => undefined} title="">
        <div><div><div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

