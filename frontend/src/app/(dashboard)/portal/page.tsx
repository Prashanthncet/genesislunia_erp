"use client";

import Link from "next/link";
import { ROLE, useMe } from "@/lib/auth";
import { greeting, inr, relativeTime } from "@/lib/format";
import { Badge, Card, CardHead, EmptyState, Icon, ProgressBar } from "@/components/ui";
import { PortalPage, classLabel, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";

type TodayTT = {
  day: string;
  slots: { day_of_week: string; period_number: number; subject: string; teacher_name: string }[];
  periods: { periodNumber: number; startTime: string; endTime: string; isBreak: boolean }[];
  substitutions: { period_number: number; substitute_name: string }[];
};

function Tile({ href, icon, label, value, hint, tone = "brand" }: {
  href: string; icon: string; label: string; value: string; hint?: string; tone?: "brand" | "ok" | "warn" | "danger";
}) {
  const chip = { brand: "bg-brand-50 text-brand-700", ok: "bg-ok-soft text-ok-ink", warn: "bg-warn-soft text-warn-ink", danger: "bg-danger-soft text-danger-ink" }[tone];
  return (
    <Link href={href} className="card card-hover flex min-h-[7rem] flex-col justify-between p-4">
      <span className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-3">{label}</span>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${chip}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </span>
      <span>
        <span className="block font-display text-[24px] font-bold leading-tight tnum text-ink">{value}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] text-ink-3">{hint}</span>}
      </span>
    </Link>
  );
}

function TodayCard({ child }: { child: PortalChild }) {
  const { data } = useChildData<TodayTT>(child.id, "timetable");
  const today = (data?.slots ?? []).filter((s) => s.day_of_week === data?.day).sort((a, b) => a.period_number - b.period_number);
  const subs = new Map((data?.substitutions ?? []).map((s) => [s.period_number, s.substitute_name]));
  const time = (n: number) => data?.periods.find((p) => p.periodNumber === n);
  return (
    <Card>
      <CardHead
        icon="timetable"
        title="Today's classes"
        subtitle={data ? data.day : undefined}
        actions={<Link href="/portal/timetable" className="btn-soft">Week</Link>}
      />
      {!data ? (
        <div className="p-5"><div className="skeleton h-24 w-full" /></div>
      ) : today.length === 0 ? (
        <EmptyState icon="calendar" title="No classes today" hint="Enjoy the day off." />
      ) : (
        <ul className="divide-y divide-line">
          {today.map((s) => (
            <li key={s.period_number} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-14 shrink-0 text-[11.5px] font-semibold tnum text-ink-3">
                {time(s.period_number)?.startTime ?? `P${s.period_number}`}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{s.subject}</span>
                <span className="block truncate text-[11.5px] text-ink-3">
                  {subs.has(s.period_number) ? `Substitute: ${subs.get(s.period_number)}` : s.teacher_name}
                </span>
              </span>
              {subs.has(s.period_number) && <Badge tone="amber">Substitution</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Overview({ child, isParent }: { child: PortalChild; isParent: boolean }) {
  const att = child.attendance.attendance_pct;
  const marks = child.latest_marks;
  return (
    <div className="space-y-4">
      <section className="rounded-panel border border-navy-800 bg-navy-900 p-5 text-white shadow-card sm:p-6">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-brand-300">{classLabel(child.class)}</p>
        <h2 className="mt-1 font-display text-[22px] font-extrabold leading-tight sm:text-[26px]">{child.full_name}</h2>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-white/70">
          <span>Adm. {child.admission_no}</span>
          {child.roll_no && <span>Roll {child.roll_no}</span>}
          {child.house && <span>{child.house} House</span>}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          href="/portal/attendance"
          icon="attendance"
          label="Attendance this month"
          value={att === null ? "—" : `${att.toFixed(1)}%`}
          hint={child.attendance.total ? `${child.attendance.present} of ${child.attendance.total} days` : "No roll calls yet"}
          tone={att === null ? "brand" : att >= 90 ? "ok" : att >= 75 ? "warn" : "danger"}
        />
        {isParent ? (
          <Tile
            href="/portal/fees"
            icon="fees"
            label="Fee balance"
            value={inr(child.fees.balance)}
            hint={child.fees.overdue ? `${child.fees.overdue} overdue invoice${child.fees.overdue > 1 ? "s" : ""}` : child.fees.balance ? "Nothing overdue" : "All paid"}
            tone={child.fees.overdue ? "danger" : child.fees.balance ? "warn" : "ok"}
          />
        ) : (
          <Tile href="/cbt" icon="cbt" label="Online tests" value="Open" hint="Tests published for your class" />
        )}
        <Tile
          href="/portal/results"
          icon="exams"
          label="Latest result"
          value={marks?.pct == null ? "—" : `${marks.pct.toFixed(0)}%`}
          hint={marks ? `${marks.exam_name}${marks.grade ? ` · Grade ${marks.grade}` : ""}` : "No marks yet"}
        />
        {isParent ? (
          <Tile
            href="/portal/leaves"
            icon="leaves"
            label="Pending requests"
            value={String(child.pending_leaves + child.pending_gate_passes)}
            hint={`${child.pending_leaves} leave · ${child.pending_gate_passes} gate pass`}
            tone={child.pending_leaves + child.pending_gate_passes ? "warn" : "ok"}
          />
        ) : (
          <Tile href="/portal/timetable" icon="timetable" label="Timetable" value="Week" hint="Your class schedule" />
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <TodayCard child={child} />

        {marks && (
          <Card>
            <CardHead
              icon="exams"
              title={marks.exam_name}
              subtitle="Latest marks by subject"
              actions={<Link href="/portal/results" className="btn-soft">All results</Link>}
            />
            <ul className="space-y-3 p-5">
              {marks.subjects.map((s) => (
                <li key={s.code}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="font-semibold text-ink">{s.subject}</span>
                    <span className="tnum text-ink-2">{s.score}/{s.max_score}{s.grade ? ` · ${s.grade}` : ""}</span>
                  </div>
                  <ProgressBar value={s.pct ?? 0} tone={(s.pct ?? 0) >= 60 ? "emerald" : (s.pct ?? 0) >= 40 ? "amber" : "rose"} label={`${s.subject} score`} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {isParent && (
          <Card>
            <CardHead
              icon="bell"
              title="Recent messages"
              subtitle="Last 5 messages from the school"
              actions={<Link href="/portal/messages" className="btn-soft">All</Link>}
            />
            {child.messages.length === 0 ? (
              <EmptyState icon="bell" title="No messages yet" />
            ) : (
              <ul className="divide-y divide-line">
                {child.messages.map((m) => (
                  <li key={m.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{m.subject ?? `${m.channel.toUpperCase()} message`}</p>
                      <span className="shrink-0 text-[11px] text-ink-3">{relativeTime(m.created_at)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export default function PortalHome() {
  const { me } = useMe();
  const isParent = me?.role === ROLE.PARENT;
  const first = (me?.name ?? "").split(" ").filter((p) => !/^(mr|mrs|ms|dr)\.?$/i.test(p))[0];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold leading-tight text-brand-700 sm:text-[28px]">
          {greeting()}{first ? `, ${first}` : ""}
        </h1>
        <p className="mt-1 text-[13px] text-ink-3">
          {isParent ? "Everything about your child's school day, in one place." : "Your timetable, attendance and results."}
        </p>
      </div>
      <PortalPage>{(child) => <Overview child={child} isParent={isParent} />}</PortalPage>
    </div>
  );
}
