"use client";

import Link from "next/link";
import { ROLE_LABEL, isPortal, useMe } from "@/lib/auth";
import { Badge, Card, CardHead, EmptyState, Icon, PageHeader } from "@/components/ui";

/** Read-only profile from GET /auth/me. Changes to name/role are made by the school. */
export default function AccountPage() {
  const { me } = useMe();
  if (!me) return null;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Name", value: me.name ?? "—" },
    { label: "Email / login ID", value: <span className="break-all">{me.email}</span> },
    { label: "Role", value: <Badge tone="brand">{ROLE_LABEL[me.role] ?? me.role}</Badge> },
    { label: "School", value: me.branch_name },
  ];
  if (me.staff) {
    rows.push({ label: "Staff record", value: `${me.staff.name} · ${me.staff.role}${me.staff.department ? ` · ${me.staff.department}` : ""}` });
  }
  if (me.student) {
    rows.push({ label: "Student record", value: `${me.student.fullName} · ${me.student.admissionNo}` });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader icon="user" eyebrow="Account" title="My account" subtitle="Who you are signed in as, and what this login is linked to." />

      <Card>
        <CardHead
          icon="user"
          title="Profile"
          actions={
            <Link href="/account/password" className="btn-soft">
              <Icon name="lock" className="h-4 w-4" />
              Change password
            </Link>
          }
        />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="label">{r.label}</dt>
              <dd className="text-[13.5px] text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mx-5 mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-ink-2">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
          Your name, email and role are managed by the school. Ask the office if anything here is wrong.
        </p>
      </Card>

      {isPortal(me) && me.role === "parent" && (
        <Card>
          <CardHead icon="students" title="Linked children" subtitle="You can only see records for these students." />
          {me.children.length === 0 ? (
            <EmptyState icon="students" title="No children linked yet" hint="Ask the school office to link your child to this login." />
          ) : (
            <ul className="divide-y divide-line">
              {me.children.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{c.fullName}</p>
                    <p className="text-[12px] text-ink-3">
                      {c.class ? `${c.class.name}${c.class.section ? ` ${c.class.section}` : ""}` : "No class"} · Adm. {c.admissionNo}
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
    </div>
  );
}
