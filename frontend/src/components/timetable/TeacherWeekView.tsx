"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Select } from "@/components/ui";
import { WeekGrid, type WeekSlot } from "@/components/WeekGrid";
import { type TeacherWeekResponse, type TtPeriod, type TtTeacher, errMsg } from "./types";

/** One teacher's week: regular lessons, covers they take and lessons handed to substitutes. */
export function TeacherWeekView({
  teachers, periods, date, defaultTeacherId, onError,
}: {
  teachers: TtTeacher[];
  periods: TtPeriod[];
  date: string;
  defaultTeacherId: string | null;
  onError: (m: string) => void;
}) {
  const [teacherId, setTeacherId] = useState(defaultTeacherId ?? "");
  const [data, setData] = useState<TeacherWeekResponse | null>(null);

  useEffect(() => {
    if (!teacherId && (defaultTeacherId || teachers[0])) setTeacherId(defaultTeacherId ?? teachers[0].id);
  }, [teacherId, defaultTeacherId, teachers]);

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

  // Teacher list for the picker: include the default even if its designation isn't "Teacher" (e.g. HOD/VP).
  const options = teachers.some((t) => t.id === teacherId) || !data
    ? teachers
    : [{ id: data.teacher.id, name: data.teacher.name } as TtTeacher, ...teachers];

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-ink">Teacher week</h3>
          <p className="text-[12.5px] text-ink-3">
            {data ? `${data.teacher.name} · ${lessons} lessons/week · max ${data.teacher.max_periods}/day · week of ${data.week.from}` : "Pick a teacher"}
            {data && data.covers.length ? ` · ${data.covers.length} cover${data.covers.length === 1 ? "" : "s"} this week` : ""}
          </p>
        </div>
        <Select aria-label="Teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="w-auto">
          {options.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>
      <WeekGrid
        slots={slots}
        periods={periods}
        days={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
        emptyText="This teacher has no lessons or covers this week."
      />
    </div>
  );
}
