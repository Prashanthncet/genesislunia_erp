"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, ROLE, ROLE_LABEL, hasRole, isPortal, useMe, type Me } from "@/lib/auth";
import { canAccess } from "@/lib/nav";
import { formatDate, relativeTime } from "@/lib/format";
import { Badge, Card, CardHead, EmptyState, Icon, MailLink, PhoneLink, Skeleton } from "@/components/ui";
import { Chip, Monogram, initials, toneFor } from "@/components/RecordCard";

/** GET /api/staff/me (directory fields only + own leave; salary is not shown here). */
type StaffMe = {
  id: string; name: string; email: string; role: string; department: string | null; phone: string | null;
  subjects: string | null; maxPeriodsPerDay: number; isActive: boolean;
};
type MyClass = { id: string; name: string; section: string | null; is_class_teacher?: boolean; _count?: { students: number } };
type TeacherWeek = { slots: { day_of_week: string; period_number: number; subject: string; class_id: string; class_name: string }[] };

/** `password_changed_at` is returned by /auth/me; older backends omit it. */
type MeWithPassword = Me & { password_changed_at?: string | null };

/** undefined = loading, null = not available for this login (403/404/network), else data. */
function useOptional<T>(path: string | null): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!path) { setData(null); return; }
    let live = true;
    apiFetch<T>(path).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [path]);
  return data;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

const cls = (c: { name: string; section: string | null }) => [c.name, c.section].filter(Boolean).join(" ");

/** Read-only profile. Name, role and employment details are maintained by the school office / HR. */
export default function AccountPage() {
  const { me } = useMe();
  if (!me) return null;
  return isPortal(me) ? <PortalProfile me={me} /> : <StaffProfile me={me} />;
}

function ProfileHeader({ name, lines, me, chips }: { name: string; lines: React.ReactNode[]; me: Me; chips?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-panel border border-navy-800 bg-navy-900 p-5 text-white shadow-card sm:p-7">
      <div className="flex flex-wrap items-center gap-4 sm:gap-5">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/10 font-display text-[22px] font-bold text-white ring-1 ring-white/20 sm:h-20 sm:w-20 sm:text-[26px]" aria-hidden>
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-300">{me.branch_name}</p>
          <h1 className="mt-1 truncate font-display text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{name}</h1>
          {lines.filter(Boolean).map((l, i) => <p key={i} className="mt-0.5 text-[13px] text-white/70">{l}</p>)}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="badge badge-brand">{ROLE_LABEL[me.role] ?? me.role}</span>
            {chips}
          </div>
        </div>
        <Link href="/account/password" className="btn-soft shrink-0">
          <Icon name="lock" className="h-4 w-4" />
          Change password
        </Link>
      </div>
    </section>
  );
}

function LoginCard({ me }: { me: MeWithPassword }) {
  const changed = me.password_changed_at;
  return (
    <Card>
      <CardHead icon="key" title="Sign-in" subtitle="How you log in to the ERP." />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
        <Detail label="Login ID / email"><span className="break-all">{me.email}</span></Detail>
        <Detail label="Login role"><Badge tone="brand">{ROLE_LABEL[me.role] ?? me.role}</Badge></Detail>
        <Detail label="School">{me.branch_name}</Detail>
        <Detail label="Password last changed">
          {changed ? <span title={new Date(changed).toLocaleString("en-IN")}>{formatDate(changed)} <span className="text-ink-3">({relativeTime(changed)})</span></span> : <span className="text-ink-3">Not recorded</span>}
        </Detail>
      </dl>
      <p className="mx-5 mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-ink-2">
        <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
        Your name, email, role and employment details are managed by the school. Ask the office or HR if anything here is wrong.
      </p>
    </Card>
  );
}

function QuickLinks({ me, links }: { me: Me; links: { href: string; icon: string; label: string; hint: string }[] }) {
  const shown = links.filter((l) => canAccess(l.href, me.role));
  if (!shown.length) return null;
  return (
    <Card>
      <CardHead icon="sparkles" title="Quick links" />
      <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {shown.map((l) => (
          <Link key={`${l.href}-${l.label}`} href={l.href} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 transition-colors hover:bg-surface-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon name={l.icon} className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">{l.label}</span>
              <span className="block truncate text-[11.5px] text-ink-3">{l.hint}</span>
            </span>
            <Icon name="chevronRight" className="h-4 w-4 text-ink-3" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ── Staff ────────────────────────────────────────────────────── */

function StaffProfile({ me }: { me: MeWithPassword }) {
  const hasStaff = !!me.staff;
  const staff = useOptional<StaffMe>(hasStaff ? "/api/staff/me" : null);
  const teaches = hasRole(me, R.ACADEMIC_STAFF) && hasRole(me, [...R.TEACHING]);
  const myClasses = useOptional<MyClass[]>(hasStaff && hasRole(me, [...R.ATTENDANCE_MARK]) ? "/api/attendance/my-classes" : null);
  const week = useOptional<TeacherWeek>(hasStaff && teaches && me.staff ? `/api/timetable/teacher/${encodeURIComponent(me.staff.id)}/week` : null);

  const classTeacherOf = Array.isArray(myClasses) ? myClasses.filter((c) => c.is_class_teacher) : [];
  // Subject → classes taught, with periods per week, from the caller's own timetable.
  const teaching = useMemo(() => {
    if (!week) return [];
    const by = new Map<string, Map<string, number>>();
    for (const s of week.slots) {
      const m = by.get(s.subject) ?? new Map<string, number>();
      m.set(s.class_name, (m.get(s.class_name) ?? 0) + 1);
      by.set(s.subject, m);
    }
    return [...by.entries()].map(([subject, classes]) => ({
      subject, periods: [...classes.values()].reduce((a, b) => a + b, 0), classes: [...classes.entries()].sort(([a], [b]) => a.localeCompare(b)),
    })).sort((a, b) => b.periods - a.periods);
  }, [week]);

  const name = staff?.name ?? me.staff?.name ?? me.name ?? me.email;
  const designation = staff?.role ?? me.staff?.role ?? null;
  const department = staff?.department ?? me.staff?.department ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <ProfileHeader
        me={me}
        name={name}
        lines={[[designation, department].filter(Boolean).join(" · ") || null]}
        chips={classTeacherOf.map((c) => <span key={c.id} className="badge badge-sky">Class teacher · {cls(c)}</span>)}
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHead icon="staff" title="Employee details" subtitle={hasStaff ? "From your staff record." : undefined} />
          {!hasStaff ? (
            <EmptyState icon="staff" title="No staff record linked" hint="This login isn't linked to a staff record, so there are no employment details or payslips. Ask HR to link it." />
          ) : staff === undefined ? (
            <div className="grid grid-cols-2 gap-4 p-5">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              <Detail label="Name">{name}</Detail>
              <Detail label="Designation">{designation ?? "—"}</Detail>
              <Detail label="Department">{department ?? "—"}</Detail>
              <Detail label="Employee ID"><span className="font-mono text-[12.5px]">{me.staff?.id}</span></Detail>
              <Detail label="Work email"><MailLink value={staff?.email ?? null} /></Detail>
              <Detail label="Phone"><PhoneLink value={staff?.phone ?? null} /></Detail>
              {staff?.subjects && <Detail label="Subjects (record)">{staff.subjects}</Detail>}
              {teaches && staff && <Detail label="Max periods / day"><span className="tnum">{staff.maxPeriodsPerDay}</span></Detail>}
              {staff && <Detail label="Status"><Badge tone={staff.isActive ? "emerald" : "slate"}>{staff.isActive ? "Active" : "Inactive"}</Badge></Detail>}
            </dl>
          )}
        </Card>

        <LoginCard me={me} />

        {teaches && hasStaff && (
          <Card className="lg:col-span-2">
            <CardHead icon="book" title="Classes & subjects" subtitle="Class-teacher duty and what you teach, from the timetable." />
            <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Class teacher of</p>
                {myClasses === undefined ? <Skeleton className="h-8 w-40" />
                  : classTeacherOf.length === 0 ? <p className="text-[13px] text-ink-3">Not a class teacher this year.</p>
                  : (
                    <ul className="space-y-2">
                      {classTeacherOf.map((c) => (
                        <li key={c.id} className="flex items-center gap-3">
                          <Monogram text={c.name.replace(/^Class\s*/i, "").slice(0, 3)} tone={toneFor(c.name)} size="sm" />
                          <span className="text-[13px] font-semibold text-ink">{cls(c)}</span>
                          {c._count && <span className="text-[12px] text-ink-3 tnum">{c._count.students} students</span>}
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Teaching</p>
                {week === undefined ? <Skeleton className="h-16 w-full" />
                  : week === null ? <p className="text-[13px] text-ink-3">Your timetable isn&apos;t available right now.</p>
                  : teaching.length === 0 ? <p className="text-[13px] text-ink-3">No periods on your timetable yet.</p>
                  : (
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {teaching.map((t) => (
                        <li key={t.subject} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
                          <span className="min-w-[8rem] text-[13px] font-semibold text-ink">{t.subject}</span>
                          <span className="flex flex-1 flex-wrap gap-1.5">
                            {t.classes.map(([c, n]) => <Chip key={c} tone={toneFor(c)}>{c} <span className="tnum opacity-70">×{n}</span></Chip>)}
                          </span>
                          <span className="shrink-0 text-[12px] text-ink-3 tnum">{t.periods} periods / week</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          </Card>
        )}

        <div className="lg:col-span-2">
          <QuickLinks
            me={me}
            links={[
              { href: "/timetable", icon: "timetable", label: "My timetable", hint: "Your week, covers and substitutions" },
              { href: "/staff", icon: "wallet", label: "My payslips", hint: "Download released payslips" },
              { href: "/leaves", icon: "leaves", label: "My leave", hint: "Apply and track your leave" },
              ...(me.role === ROLE.WARDEN || me.role === ROLE.SECURITY
                ? [{ href: "/gate", icon: "door", label: "Gate Desk", hint: "Passes, exits, returns and visitors" }]
                : []),
              { href: "/account/password", icon: "lock", label: "Change password", hint: "Update your sign-in password" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Parent / student ─────────────────────────────────────────── */

function PortalProfile({ me }: { me: MeWithPassword }) {
  const student = me.role === ROLE.STUDENT;
  const name = me.name ?? me.student?.fullName ?? me.email;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <ProfileHeader
        me={me}
        name={name}
        lines={[student && me.student ? `Admission no. ${me.student.admissionNo}` : me.children.length ? `Parent of ${me.children.map((c) => c.fullName.split(" ")[0]).join(", ")}` : null]}
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <LoginCard me={me} />

        {me.role === ROLE.PARENT && (
          <Card>
            <CardHead icon="students" title="Linked children" subtitle="You can only see records for these students." />
            {me.children.length === 0 ? (
              <EmptyState icon="students" title="No children linked yet" hint="Ask the school office to link your child to this login." />
            ) : (
              <ul className="divide-y divide-line">
                {me.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Monogram text={initials(c.fullName)} tone={toneFor(c.fullName)} shape="circle" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink">{c.fullName}</p>
                      <p className="text-[12px] text-ink-3">
                        {c.class ? cls(c.class) : "No class"} · Adm. <span className="font-mono">{c.admissionNo}</span>
                        {c.rollNo ? ` · Roll ${c.rollNo}` : ""}{c.house ? ` · ${c.house} House` : ""}
                      </p>
                    </div>
                    <Badge tone="slate">{c.relation}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {student && (
          <Card>
            <CardHead icon="user" title="Student record" />
            {me.student ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
                <Detail label="Name">{me.student.fullName}</Detail>
                <Detail label="Admission no"><span className="font-mono">{me.student.admissionNo}</span></Detail>
              </dl>
            ) : <EmptyState icon="user" title="No student record linked" hint="Ask the school office to link your login." />}
          </Card>
        )}

        <div className="lg:col-span-2">
          <QuickLinks
            me={me}
            links={[
              { href: "/portal/attendance", icon: "attendance", label: "Attendance", hint: "Month calendar" },
              { href: "/portal/timetable", icon: "timetable", label: "Timetable", hint: "Weekly class timetable" },
              { href: "/portal/results", icon: "exams", label: student ? "Results" : "Report card", hint: "Marks and report card" },
              { href: "/portal/messages", icon: "bell", label: "Notices & messages", hint: "From the school" },
              { href: "/account/password", icon: "lock", label: "Change password", hint: "Update your sign-in password" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
