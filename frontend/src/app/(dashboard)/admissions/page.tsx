"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, MailLink, PageHeader, PhoneLink, ProgressBar, Reveal, StatCard, Tabs, useToast } from "@/components/ui";

type Field = {
  id: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  validationRule: string | null;
  status: string;
};

type Application = {
  id: string;
  studentName: string | null;
  parentName: string | null;
  parentEmail: string | null;
  parentContact?: string | null;
  status: string;
  paymentStatus: string;
  rollNo: string | null;
  house: string | null;
  token?: string | null;
};

type BadgeTone = "slate" | "emerald" | "amber" | "rose" | "sky" | "violet" | "brand" | "teal";

const STATUS_STYLES: Record<string, BadgeTone> = {
  "Admission Complete": "emerald",
  "Links Sent": "slate",
  "Re-submit": "rose",
  "Fee Approved": "teal",
  "Submitted by Parent": "sky",
  "Document Validated": "sky",
  "Roll No Assigned": "violet",
  "VP Approved": "violet",
  "VP Approved & Fee Paid": "brand",
};



export default function AdmissionsPage() {
  const [tab, setTab] = useState<"AO" | "Workflow">("AO");
  const [fields, setFields] = useState<Field[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const toast = useToast();
  const [fieldType, setFieldType] = useState("text");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, apps] = await Promise.all([
        apiFetch<Field[]>("/api/admissions/fields"),
        apiFetch<Application[]>("/api/admissions"),
      ]);
      setFields(f ?? []);
      setApplications(apps ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addField = async () => {
    if (!label) return;
    setLoading(true);
    try {
      await apiFetch("/api/admissions/fields", {
        method: "POST",
        body: JSON.stringify({ label, field_type: fieldType, is_required: true }),
      });
      setLabel("");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteField = async (id: string) => {
    setLoading(true);
    try {
      await apiFetch(`/api/admissions/fields/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setLoading(false);
    }
  };

  const triggerAction = async (url: string, body: object = {}, msg = "Done") => {
    setLoading(true);
    try {
      await apiFetch(url, { method: "POST", body: JSON.stringify(body) });
      toast.push(msg, "success");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const printLetter = async (id: string) => {
    try {
      const d = await apiFetch<{
        student_name: string | null; dob: string | null; parent_name: string | null;
        roll_no: string | null; house: string | null; class_applied: string | null; status: string;
      }>(`/api/admissions/${id}/letter-data`);
      const w = window.open("", "_blank", "width=720,height=800");
      if (!w) return;
      w.document.write(`<!doctype html><html><head><title>Admission Letter — ${d.student_name ?? ""}</title>
        <style>body{font-family:Georgia,serif;padding:48px;color:#1e293b;max-width:640px;margin:auto}h1{font-size:16px;letter-spacing:2px;color:#0f2a43;text-transform:uppercase}
        .rule{border-top:2px solid #0f2a43;margin:8px 0 24px}p{line-height:1.7;font-size:14px}
        table{margin:20px 0;width:100%;font-size:14px}td{padding:4px 12px 4px 0}.sig{margin-top:48px;text-align:right}</style></head><body>
        <h1>Genesis Lumia School</h1><div class="rule"></div>
        <p>Admission No. <b>${d.roll_no ?? "—"}</b> &nbsp;·&nbsp; Date: ${new Date().toLocaleDateString()}</p>
        <p>Dear ${d.parent_name ?? "Parent"},</p>
        <p>We are pleased to inform you that <b>${d.student_name ?? "the applicant"}</b>${d.dob ? ` (born ${d.dob})` : ""} has been granted admission
        ${d.class_applied ? `to <b>${d.class_applied}</b>` : ""} for the academic year ${new Date().getFullYear()}-${new Date().getFullYear() + 1}.</p>
        <table>
          <tr><td><b>Roll Number</b></td><td>${d.roll_no ?? "—"}</td></tr>
          <tr><td><b>House</b></td><td>${d.house ?? "—"}</td></tr>
          <tr><td><b>Application Status</b></td><td>${d.status}</td></tr>
        </table>
        <p>Please complete the remaining formalities at the school office. We look forward to welcoming you.</p>
        <div class="sig"><p><b>Principal</b><br/>Genesis Lumia School</p></div>
        </body></html>`);
      w.document.close();
      w.print();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Letter requires VP approval", "error");
    }
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="admissions"
          title="Admissions"
          subtitle="End-to-end 9-step onboarding workflow (AO → Parent → OS → Accounts → VP → Principal)."
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Applications" value={applications.length} tone="brand" icon="admissions" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="In Progress" value={applications.filter((a) => a.status !== "Admission Complete").length} tone="amber" icon="spark" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Completed" value={applications.filter((a) => a.status === "Admission Complete").length} tone="emerald" icon="check" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="AO Fields" value={fields.length} tone="violet" icon="exams" />
        </Reveal>
      </div>

      <Reveal delay={60}>
        <div className="card p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Pipeline health
          </p>
          <ProgressBar
            value={applications.length
              ? (applications.filter((a) => a.status === "Admission Complete").length / applications.length) * 100
              : 0}
            tone="emerald"
          />
          <p className="mt-2 text-xs text-slate-500">
            {applications.filter((a) => a.status === "Admission Complete").length} of {applications.length} applications fully onboarded
          </p>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "AO" as const, label: "AO View (Fields)" },
            { id: "Workflow" as const, label: "Workflow (Applications)" },
          ]}
        />
      </Reveal>

      {tab === "AO" && (
        <div key="AO" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <Icon name="spark" className="h-4 w-4 text-brand-600" /> Mandatory Field Builder
            </h3>
            <div className="flex flex-wrap gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Field label e.g. Aadhar Number"
                className="min-w-56 field flex-1"
              />
              <select
                aria-label="Field type"
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                className="field w-auto"
              >
                {["text", "date", "email", "phone", "number", "document"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <Button variant="primary" onClick={addField} loading={loading}>
                <Icon name="plus" className="h-4 w-4" /> Add Field
              </Button>
              <Button variant="accent" onClick={() => triggerAction("/api/admissions/setup-fields", {}, "Sent to OS for approval")} loading={loading}>
                <Icon name="spark" className="h-4 w-4" /> Send to OS
              </Button>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Required</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id} className="row-hover border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">{f.label}</td>
                    <td className="px-4 py-3">
                      <Badge tone="sky">{f.fieldType}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {f.isRequired ? <Badge tone="rose">Required</Badge> : <Badge tone="slate">Optional</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs">{f.status}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteField(f.id)}
                        className="btn-danger !px-2.5 !py-1 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {fields.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No fields yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Workflow" && (
        <div key="Workflow" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <Button
            variant="primary"
            loading={loading}
            onClick={() =>
              triggerAction(
                "/api/admissions/trigger-links",
                { parents: [{ parent_name: "New Parent", parent_email: "parent@example.com", parent_contact: "9800000000" }] },
                "Links triggered",
              )
            }
          >
            <Icon name="plus" className="h-4 w-4" /> Trigger Parent Links
          </Button>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Roll No</th>
                  <th className="px-4 py-3">Next Step</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => {
                  const step =
                    a.status === "Links Sent"
                      ? { label: "Submit Form", url: `/api/admissions/${a.id}/submit`, body: { student_name: a.parentName ?? "Applicant", dob: "2014-01-01" } }
                      : a.status === "Submitted by Parent"
                        ? { label: "Validate Docs", url: `/api/admissions/${a.id}/validate`, body: { isValid: true } }
                        : a.status === "Document Validated"
                          ? { label: "Pay Fee", url: `/api/admissions/${a.id}/pay`, body: {} }
                          : a.status === "Fee Approved"
                            ? { label: "Allocate Roll No", url: `/api/admissions/${a.id}/allocate`, body: {} }
                            : a.status === "Roll No Assigned"
                              ? { label: "VP Approve", url: `/api/admissions/${a.id}/vp-approve`, body: {} }
                              : a.status === "VP Approved"
                                ? { label: "Principal Approve", url: `/api/admissions/${a.id}/principal-approve`, body: {} }
                                : null;
                  return (
                    <tr key={a.id} className="row-hover border-t border-slate-100">
                      <td className="px-4 py-3">
                        <span className="block font-semibold">{a.studentName ?? a.parentName ?? "—"}</span>
                        {(a.parentName || a.parentEmail) && (
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                            {a.parentName && <PhoneLink value={a.parentContact} className="text-slate-400" />}
                            <MailLink value={a.parentEmail} className="text-slate-400" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_STYLES[a.status] ?? "sky"}>{a.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">{a.paymentStatus}</td>
                      <td className="px-4 py-3 font-mono text-xs">{a.rollNo ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-1.5">
                        {step ? (
                          <button
                            onClick={() => triggerAction(step.url, step.body, `${step.label} done`)}
                            disabled={loading}
                            className="btn-primary !px-3 !py-1 text-xs"
                          >
                            {step.label}
                          </button>
                        ) : (
                          <Badge tone="emerald">Complete</Badge>
                        )}
                        {(a.status === "VP Approved" || a.status === "Admission Complete") && (
                          <button onClick={() => printLetter(a.id)} className="btn-soft !px-3 !py-1 text-xs">
                            <Icon name="print" className="h-3.5 w-3.5" /> Letter
                          </button>
                        )}
                        {a.status === "Links Sent" && a.token && (
                          <a
                            href={`/admission-form?token=${a.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-soft !px-3 !py-1 text-xs"
                          >
                            Parent Link
                            <Icon name="spark" className="h-3.5 w-3.5" />
                          </a>
                        )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {applications.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No applications yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
