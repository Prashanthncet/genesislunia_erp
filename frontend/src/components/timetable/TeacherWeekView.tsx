"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { Button, Icon, Input, Select, Tabs } from "@/components/ui";
import { WeekGrid, type WeekSlot } from "@/components/WeekGrid";
import { DayView } from "./DayView";
import { type TeacherWeekResponse, type TtPeriod, type TtTeacher, errMsg } from "./types";

/** One teacher's week: regular lessons, covers they take and lessons handed to substitutes. */
export function TeacherWeekView({
  teachers, periods, date, defaultTeacherId, onError, canDownload,
}: {
  teachers: TtTeacher[];
  periods: TtPeriod[];
  date: string;
  defaultTeacherId: string | null;
  onError: (m: string) => void;
  /** Teachers may download their own week; timetable admins anyone's. */
  canDownload?: (teacherId: string) => boolean;
}) {
  const [teacherId, setTeacherId] = useState(defaultTeacherId ?? "");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<TeacherWeekResponse | null>(null);
  const [view, setView] = useState<"week" | "day">("week");
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await apiDownload(`/api/timetable/teacher/${data.teacher.id}/pdf`, `timetable-${data.teacher.name}.pdf`);
    } catch (e) {
      onError(errMsg(e, "Download failed"));
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!teacherId && (defaultTeacherId || teachers[0])) setTeacherId(defaultTeacherId ?? teachers[0].id);
  }, [teacherId, defaultTeacherId, teachers]);

  // Teacher list for the picker: include the default even if its designation isn't "Teacher" (e.g. HOD/VP).
  const options = useMemo(
    () =>
      teachers.some((t) => t.id === teacherId) || !data
        ? teachers
        : [{ id: data.teacher.id, name: data.teacher.name } as TtTeacher, ...teachers],
    [teachers, teacherId, data],
  );

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((t) => `${t.name} ${t.subjects ?? ""}`.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (search.trim() && filteredOptions.length > 0 && !filteredOptions.some((t) => t.id === teacherId)) {
      setTeacherId(filteredOptions[0].id);
    }
  }, [search, filteredOptions, teacherId]);

  useEffect(() => {
    if (!teacherId) return;
    let live = true;
    apiFetch<TeacherWeekResponse>(`/api/timetable/teacher/${teacherId}/week?date=${date}`)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) onError(errMsg(e, "Failed to load teacher week")); });
    return () => { live = false; };
  }, [teacherId, date, onError]);

  const handed = new Map((data?.handed_over ?? []).map((h) => [`${h.day_of_week}|${h.period_number}|${h.class_id}`, h]));
  const slots: WeekSlot[] = [
    ...(data?.slots ?? []).map((s) => {
      const h = handed.get(`${s.day_of_week}|${s.period_number}|${s.class_id}`);
      return {
        day_of_week: s.day_of_week,
        period_number: s.period_number,
        subject: s.subject,
        secondary: s.class_name,
        variant: h?.status === "Assigned" ? ("relieved" as const) : ("regular" as const),
        note: h ? (h.status === "Assigned" ? `${h.date}: covered by ${h.substitute_name}` : `${h.date}: cover requested`) : undefined,
      };
    }),
    ...(data?.covers ?? []).map((c) => ({
      day_of_week: c.day_of_week,
      period_number: c.period_number,
      subject: c.subject ?? "Cover",
      secondary: c.class_name,
      variant: "cover" as const,
      note: `${c.date}${c.original_teacher_name ? ` for ${c.original_teacher_name}` : ""}`,
    })),
  ];
  const lessons = data?.slots.length ?? 0;
  const roomAt = new Map((data?.slots ?? []).map((x) => [`${x.day_of_week}|${x.period_number}`, x.room_name]));

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-ink">Teacher week</h3>
          <p className="text-[12.5px] text-ink-3">
            {data ? `${data.teacher.name} · ${lessons} lessons/week · max ${data.teacher.max_periods}/day · week of ${data.week.from}` : "Pick a teacher"}
            {data && data.covers.length ? ` · ${data.covers.length} cover${data.covers.length === 1 ? "" : "s"} this week` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
          <div className="relative min-w-[210px] max-md:w-full">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              aria-label="Search teacher"
              placeholder="Search teacher or subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-9 w-full"
            />
          </div>
          <Select
            aria-label="Teacher"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="w-auto max-md:!w-full"
          >
            {filteredOptions.length === 0 ? (
              <option value={teacherId}>No matching teachers</option>
            ) : (
              filteredOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.subjects ? ` — ${t.subjects}` : ""}
                </option>
              ))
            )}
          </Select>
          {data && canDownload?.(data.teacher.id) && (
            <Button size="sm" variant="soft" onClick={download} loading={downloading}>
              <Icon name="download" className="h-4 w-4" /> Download PDF
            </Button>
          )}
        </div>
      </div>
      <Tabs tabs={[{ id: "week", label: "Week" }, { id: "day", label: "Day view" }] as const} value={view} onChange={setView} />
      {view === "week" ? (
        <WeekGrid
          slots={slots}
          periods={periods}
          days={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
          emptyText="This teacher has no lessons or covers this week."
        />
      ) : (
        <DayView
          periods={periods}
          secondaryLabel="Class"
          emptyText="This teacher has no lessons this week."
          entries={slots.map((s) => ({
            day_of_week: s.day_of_week,
            period_number: s.period_number,
            subject: s.subject,
            secondary: s.secondary,
            room_name: s.variant === "cover" ? null : roomAt.get(`${s.day_of_week}|${s.period_number}`) ?? null,
            note: s.note,
            strike: s.variant === "relieved",
            badge: s.variant === "cover" ? { label: "Cover", tone: "amber" as const } : s.variant === "relieved" ? { label: "Covered", tone: "slate" as const } : undefined,
          }))}
        />
      )}
    </div>
  );
}
