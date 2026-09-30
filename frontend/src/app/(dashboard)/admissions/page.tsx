"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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
  status: string;
  paymentStatus: string;
  rollNo: string | null;
  house: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  "Admission Complete": "bg-blue-50 text-blue-700 border-blue-200",
  "Links Sent": "bg-slate-100 text-slate-600 border-slate-200",
  "Re-submit": "bg-rose-50 text-rose-700 border-rose-200",
  "Fee Approved": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function AdmissionsPage() {
  const [tab, setTab] = useState<"AO" | "Workflow">("AO");
  const [fields, setFields] = useState<Field[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
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
      alert(e instanceof Error ? e.message : "Failed");
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
      alert(msg);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Admissions</h2>
        <p className="text-sm text-slate-500">
          End-to-end 9-step onboarding workflow (AO → Parent → OS → Accounts → VP → Principal).
        </p>
      </div>

      <div className="flex gap-2">
        {(["AO", "Workflow"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t ? "bg-[#0f2a43] text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t === "AO" ? "AO View (Fields)" : "Workflow (Applications)"}
          </button>
        ))}
      </div>

      {tab === "AO" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
              Mandatory Field Builder
            </h3>
            <div className="flex flex-wrap gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Field label e.g. Aadhar Number"
                className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {["text", "date", "email", "phone", "number", "document"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={addField}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Add Field
              </button>
              <button
                onClick={() => triggerAction("/api/admissions/setup-fields", {}, "Sent to OS for approval")}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Send to OS
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
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
                  <tr key={f.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">{f.label}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        {f.fieldType}
                      </span>
                    </td>
                    <td className="px-4 py-3">{f.isRequired ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-xs">{f.status}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteField(f.id)}
                        className="rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100"
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
        <div className="space-y-4">
          <button
            onClick={() =>
              triggerAction(
                "/api/admissions/trigger-links",
                { parents: [{ parent_name: "New Parent", parent_email: "parent@example.com", parent_contact: "9800000000" }] },
                "Links triggered",
              )
            }
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Trigger Parent Links
          </button>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
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
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold">{a.studentName ?? a.parentName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            STATUS_STYLES[a.status] ?? "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{a.paymentStatus}</td>
                      <td className="px-4 py-3 text-xs">{a.rollNo ?? "—"}</td>
                      <td className="px-4 py-3">
                        {step ? (
                          <button
                            onClick={() => triggerAction(step.url, step.body, `${step.label} done`)}
                            disabled={loading}
                            className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                          >
                            {step.label}
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-600">Complete ✓</span>
                        )}
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
