"use client";

import { useState } from "react";
import { Badge, Card, CardHead, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { WeekGrid, type WeekPeriod } from "@/components/WeekGrid";
import { PortalPage, classLabel, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState } from "@/components/portal/bits";

type Timetable = {
  class: { id: string; name: string; section: string | null } | null;
  date: string;
  day: string;
  periods: WeekPeriod[];
  slots: { day_of_week: string; period_number: number; subject: string; teacher_name: string; room_name: string | null }[];
  substitutions: { period_number: number; substitute_name: string; room_name: string | null; reason: string | null }[];
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function TimetableBody({ child }: { child: PortalChild }) {
  const { data, error, loading, reload } = useChildData<Timetable>(child.id, "timetable");
  const [day, setDay] = useState<string>(() => {
    const d = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
    return (DAYS as readonly string[]).includes(d) ? d : "Mon";
  });

  const subs = new Map((data?.substitutions ?? []).map((s) => [s.period_number, s]));
  const daySlots = (data?.slots ?? []).filter((s) => s.day_of_week === day).sort((a, b) => a.period_number - b.period_number);
  const period = (n: number) => data?.periods.find((p) => p.periodNumber === n);
  const days = Array.from(new Set((data?.slots ?? []).map((s) => s.day_of_week)));

  return (
    <>
      <PanelState loading={loading} error={error} reload={reload} />
      {data && !data.class && <Card><EmptyState icon="timetable" title="No class assigned yet" /></Card>}
      {data?.class && (
        <>
          <Card>
            <CardHead
              icon="calendar"
              title={`${classLabel(data.class)} — day view`}
              subtitle={day === data.day && data.substitutions.length ? `${data.substitutions.length} substitution(s) today` : undefined}
            />
            <div className="overflow-x-auto px-4 pt-4 sm:px-5">
              <Tabs
                tabs={DAYS.filter((d) => days.includes(d)).map((d) => ({ id: d, label: d === data.day ? `${d} (today)` : d }))}
                value={day}
                onChange={setDay}
              />
            </div>
            {daySlots.length === 0 ? (
              <EmptyState icon="calendar" title="No classes on this day" />
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {daySlots.map((s) => {
                  const sub = day === data.day ? subs.get(s.period_number) : undefined;
                  const p = period(s.period_number);
                  return (
                    <li key={s.period_number} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <span className="w-20 shrink-0 text-[11.5px] tnum text-ink-3">
                        <span className="block font-semibold text-ink-2">Period {s.period_number}</span>
                        {p && `${p.startTime}–${p.endTime}`}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{s.subject}</span>
                        <span className="block truncate text-[12px] text-ink-3">
                          {sub ? <>Substitute: {sub.substitute_name}<s className="ml-1.5 opacity-70">{s.teacher_name}</s></> : s.teacher_name}
                          {(sub?.room_name ?? s.room_name) ? ` · ${sub?.room_name ?? s.room_name}` : ""}
                        </span>
                      </span>
                      {sub && <Badge tone="amber">Substitution</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead icon="timetable" title="Whole week" subtitle="Scroll sideways on a phone." />
            <div className="p-4 sm:p-5">
              <WeekGrid slots={data.slots} periods={data.periods} />
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export default function PortalTimetablePage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="timetable" title="Timetable" subtitle="The class schedule, including today's substitutions." />
      <PortalPage>{(child) => <TimetableBody key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
