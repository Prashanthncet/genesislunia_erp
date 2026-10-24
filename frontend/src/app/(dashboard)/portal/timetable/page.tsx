"use client";

import { useState } from "react";
import { apiDownload } from "@/lib/api";
import { Button, Card, CardHead, EmptyState, Icon, PageHeader, Tabs, useToast } from "@/components/ui";
import { WeekGrid, type WeekPeriod } from "@/components/WeekGrid";
import { DayView, todayDay, type DayEntry } from "@/components/timetable/DayView";
import { PortalPage, classLabel, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState } from "@/components/portal/bits";

type Timetable = {
  class: { id: string; name: string; section: string | null } | null;
  date: string;
  day: string;
  /** bell schedule incl. Short Break / Lunch Break, in time order */
  periods: WeekPeriod[];
  pdf_url?: string;
  slots: { day_of_week: string; period_number: number; subject: string; teacher_name: string; room_name: string | null }[];
  substitutions: { period_number: number; substitute_name: string; room_name: string | null; reason: string | null }[];
};

function TimetableBody({ child }: { child: PortalChild }) {
  const { data, error, loading, reload } = useChildData<Timetable>(child.id, "timetable");
  const [view, setView] = useState<"day" | "week">("day");
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  const download = async () => {
    if (!data?.class) return;
    setDownloading(true);
    try {
      await apiDownload(data.pdf_url ?? `/api/timetable/class/${data.class.id}/pdf`, `timetable-${classLabel(data.class)}.pdf`);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Download failed", "error");
    } finally {
      setDownloading(false);
    }
  };

  // Today's substitutions are applied to today's lessons in the day view.
  const subs = new Map((data?.substitutions ?? []).map((s) => [s.period_number, s]));
  const today = todayDay();
  const entries: DayEntry[] = (data?.slots ?? []).map((s) => {
    const sub = s.day_of_week === data?.day && s.day_of_week === today ? subs.get(s.period_number) : undefined;
    return {
      day_of_week: s.day_of_week,
      period_number: s.period_number,
      subject: s.subject,
      secondary: sub ? `${sub.substitute_name} (substitute for ${s.teacher_name})` : s.teacher_name,
      room_name: sub?.room_name ?? s.room_name,
      badge: sub ? { label: "Substitution", tone: "amber" } : undefined,
    };
  });

  return (
    <>
      <PanelState loading={loading} error={error} reload={reload} />
      {data && !data.class && <Card><EmptyState icon="timetable" title="No class assigned yet" /></Card>}
      {data?.class && (
        <Card>
          <CardHead
            icon="timetable"
            title={classLabel(data.class)}
            subtitle={data.substitutions.length ? `${data.substitutions.length} substitution(s) today` : "Class timetable with breaks"}
            actions={
              <Button size="sm" variant="soft" onClick={download} loading={downloading}>
                <Icon name="download" className="h-4 w-4" /> Download PDF
              </Button>
            }
          />
          <div className="space-y-4 p-3 sm:p-5 max-md:min-w-0 max-md:max-w-full">
            <Tabs tabs={[{ id: "day", label: "Day view" }, { id: "week", label: "Week" }] as const} value={view} onChange={setView} />
            {view === "day" ? (
              <DayView periods={data.periods} entries={entries} emptyText="No timetable published for this class yet." />
            ) : (
              <>
                <p className="text-[12px] text-ink-3 sm:hidden">Scroll sideways to see the whole week.</p>
                <WeekGrid slots={data.slots} periods={data.periods} days={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]} emptyText="No timetable published for this class yet." />
              </>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

export default function PortalTimetablePage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="timetable" title="Timetable" subtitle="The class schedule with times and breaks, including today's substitutions." />
      <PortalPage>{(child) => <TimetableBody key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
