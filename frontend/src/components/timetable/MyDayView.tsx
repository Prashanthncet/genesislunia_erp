"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, EmptyState, Icon } from "@/components/ui";
import { type MyDay, errMsg } from "./types";

const KIND: Record<string, { label: string; tone: "brand" | "amber" | "slate" | "sky" | "emerald" }> = {
  lesson: { label: "Lesson", tone: "brand" },
  cover: { label: "Cover", tone: "amber" },
  relieved: { label: "Covered by substitute", tone: "slate" },
  break: { label: "Break", tone: "sky" },
  free: { label: "Free", tone: "emerald" },
};

/** The logged-in teacher's schedule for a date, including covers and handed-over lessons. */
export function MyDayView({ date, onError }: { date: string; onError: (m: string) => void }) {
  const [data, setData] = useState<MyDay | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch<MyDay>(`/api/timetable/me/today?date=${date}`)
      .then((d) => { if (live) { setData(d); setMissing(false); } })
      .catch((e) => {
        if (!live) return;
        const m = errMsg(e, "Failed to load your day");
        if (/staff profile/i.test(m)) setMissing(true);
        else onError(m);
      });
    return () => { live = false; };
  }, [date, onError]);

  if (missing) {
    return <EmptyState icon="user" title="No teaching profile" hint="This login is not linked to a staff record, so there is no personal schedule." />;
  }
  if (!data) return <p className="p-6 text-sm text-ink-3">Loading your day…</p>;

  return (
    <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/50 px-5 py-4 max-md:px-4">
        <div>
          <h3 className="font-semibold text-ink">My day · {data.day} {data.date}</h3>
          <p className="text-xs text-ink-2">
            {data.counts.lessons} lesson{data.counts.lessons === 1 ? "" : "s"} · {data.counts.covers} cover{data.counts.covers === 1 ? "" : "s"}
            {data.counts.relieved ? ` · ${data.counts.relieved} handed to a substitute` : ""}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {data.schedule.map((e, i) => {
          const k = KIND[e.kind];
          if (e.kind === "break") {
            return (
              <li key={i} className="grid grid-cols-[3.5rem_6.5rem_1fr] items-center gap-3 bg-surface-2 px-5 py-2 max-md:grid-cols-[2.5rem_auto_minmax(0,1fr)] max-md:px-4">
                <Icon name="clock" className="h-4 w-4 text-ink-3" />
                <span className="tnum font-mono text-xs text-ink-2">{e.start_time ? `${e.start_time}–${e.end_time}` : "--:--"}</span>
                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">{e.note ?? "Break"}</span>
              </li>
            );
          }
          return (
            <li key={i} className={`grid grid-cols-[3.5rem_6.5rem_1fr_auto] items-center gap-3 px-5 py-3 max-md:grid-cols-[2.5rem_minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-0.5 max-md:px-4 ${e.kind === "relieved" ? "opacity-70" : ""}`}>
              <span className="text-[15px] font-bold text-brand-700 max-md:col-start-1 max-md:row-span-2 max-md:row-start-1">P{e.period_number}</span>
              <span className="tnum font-mono text-xs text-ink-2 max-md:col-start-2 max-md:row-start-2">{e.start_time ? `${e.start_time}–${e.end_time}` : "--:--"}</span>
              <div className="min-w-0 max-md:col-start-2 max-md:row-start-1">
                <p className={`truncate font-semibold text-ink ${e.kind === "relieved" ? "line-through" : ""}`}>
                  {e.kind === "free" ? "Free period" : `${e.subject ?? "Lesson"} · ${e.class_name ?? ""}`}
                </p>
                {(e.note || e.room_name) && (
                  <p className="truncate text-xs text-ink-3">{[e.room_name, e.note].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <Badge tone={k.tone} className="max-md:col-start-3 max-md:row-span-2 max-md:row-start-1">{k.label}</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
