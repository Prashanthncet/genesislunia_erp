"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Card, CardHead, EmptyState, Field, Icon, Input, PageHeader, Select, Textarea, useToast } from "@/components/ui";
import { PortalPage, usePortal, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState, StatusBadge, fmtDay } from "@/components/portal/bits";
import type { PortalLeaves } from "@/components/portal/types";

const TYPES = ["Sick", "Family", "Medical", "Festival", "Other"];
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function LeavesBody({ child }: { child: PortalChild }) {
  const toast = useToast();
  const { reload: reloadOverview } = usePortal();
  const { data, error, loading, reload } = useChildData<PortalLeaves>(child.id, "leaves");
  const [form, setForm] = useState({ leave_type: "Sick", start_date: todayIso(), end_date: todayIso(), reason: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (form.end_date < form.start_date) return setFormError("The last day can't be before the first day.");
    if (!form.reason.trim()) return setFormError("Please give a reason.");
    setSaving(true);
    try {
      await apiFetch(`/api/portal/children/${encodeURIComponent(child.id)}/leave-request`, {
        method: "POST",
        body: JSON.stringify({ ...form, reason: form.reason.trim() }),
      });
      toast.push("Leave request sent to the school");
      setForm((f) => ({ ...f, reason: "" }));
      reload();
      void reloadOverview();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send the request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHead icon="plus" title="Request leave" subtitle={`For ${child.full_name}`} />
        <form onSubmit={submit} className="space-y-3.5 p-4 sm:p-5">
          {formError && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger" role="alert">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {formError}
            </p>
          )}
          <Field label="Type of leave" required>
            <Select value={form.leave_type} onChange={set("leave_type")} aria-label="Type of leave">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" required>
              <Input type="date" value={form.start_date} onChange={set("start_date")} required />
            </Field>
            <Field label="To" required>
              <Input type="date" value={form.end_date} min={form.start_date} onChange={set("end_date")} required />
            </Field>
          </div>
          <Field label="Reason" required hint="The class teacher / warden will see this.">
            <Textarea value={form.reason} onChange={set("reason")} maxLength={500} required />
          </Field>
          <Button type="submit" variant="primary" loading={saving} className="w-full">
            <Icon name="check" className="h-4 w-4" />
            Send request
          </Button>
        </form>
      </Card>

      <Card className="lg:col-span-3">
        <CardHead icon="leaves" title="Leave requests" subtitle="Newest first" />
        <PanelState loading={loading} error={error} reload={reload} />
        {data && data.leaves.length === 0 && <EmptyState icon="leaves" title="No leave requests yet" />}
        {data && data.leaves.length > 0 && (
          <ul className="divide-y divide-line">
            {data.leaves.map((l) => (
              <li key={l.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink">
                      {l.leave_type} · {fmtDay(l.start_date)}{l.end_date !== l.start_date ? ` – ${fmtDay(l.end_date)}` : ""}
                    </p>
                    {l.reason && <p className="mt-0.5 text-[12.5px] text-ink-2">{l.reason}</p>}
                    {l.remarks && <p className="mt-0.5 text-[12px] text-ink-3">School note: {l.remarks}</p>}
                    <p className="mt-1 text-[11px] text-ink-3">{l.requested_by_me ? "Requested by you" : "Recorded by the school"}</p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function PortalLeavesPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="leaves" title="Leave requests" subtitle="Ask the school for leave and follow the approval." />
      <PortalPage>{(child) => <LeavesBody key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
