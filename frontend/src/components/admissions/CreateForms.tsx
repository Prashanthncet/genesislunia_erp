"use client";

import { useState } from "react";
import { Badge, Button, Field, Icon, IconButton, Input } from "@/components/ui";
import { currentAcademicYear, fmtDate, post } from "./shared";

type Row = { parent_name: string; parent_email: string; parent_contact: string };
type Generated = { id: string; parent_name: string; login_id: string; password: string; form_link: string; link_expires_at: string };

const blank = (): Row => ({ parent_name: "", parent_email: "", parent_contact: "" });

/**
 * AO: "Create admission form" for one or more parents. The backend creates a parent
 * login (p + 6 digits) with a random password and sends link + credentials. The password
 * is shown here ONCE for the office to hand over; it is never stored or shown again.
 */
export function CreateForms({ notify, onCreated }: { notify: (msg: string, tone?: "success" | "error") => void; onCreated: () => void }) {
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [year, setYear] = useState(currentAcademicYear());
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<Generated[]>([]);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    const parents = rows
      .map((r) => ({
        parent_name: r.parent_name.trim(),
        ...(r.parent_email.trim() ? { parent_email: r.parent_email.trim() } : {}),
        ...(r.parent_contact.trim() ? { parent_contact: r.parent_contact.trim() } : {}),
      }))
      .filter((p) => p.parent_name);
    if (!parents.length) return notify("Enter at least one parent name", "error");
    if (parents.some((p) => !("parent_email" in p) && !("parent_contact" in p))) {
      return notify("Each parent needs an email or a phone number", "error");
    }
    setBusy(true);
    try {
      const res = await post<{ generated: Generated[] }>("/api/admissions/trigger-links", { parents, academic_year: year });
      setGenerated(res.generated);
      setRows([blank()]);
      notify(`${res.generated.length} admission form${res.generated.length === 1 ? "" : "s"} created and sent`);
      onCreated();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to create forms", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => notify("Copied"), () => notify("Copy failed", "error"));
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Academic year" hint="Needs a published template for this year.">
            <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-32" pattern="\d{4}-\d{2}" />
          </Field>
        </div>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1.4fr_1.4fr_1fr_auto]">
              <Field label="Parent name" required>
                <Input value={r.parent_name} maxLength={120} onChange={(e) => set(i, { parent_name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={r.parent_email} maxLength={160} onChange={(e) => set(i, { parent_email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={r.parent_contact} maxLength={16} onChange={(e) => set(i, { parent_contact: e.target.value })} />
              </Field>
              <div className="flex items-end pb-1">
                {rows.length > 1 && <IconButton name="trash" label="Remove row" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} />}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => setRows([...rows, blank()])} disabled={rows.length >= 50}>
            <Icon name="plus" className="h-4 w-4" /> Add parent
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            <Icon name="mail" className="h-4 w-4" /> Create forms &amp; send links
          </Button>
        </div>
      </div>

      {generated.length > 0 && (
        <div className="card border-l-[3px] border-l-warn p-5">
          <div className="mb-3 flex items-start gap-2">
            <Icon name="lock" className="mt-0.5 h-4 w-4 text-warn" />
            <p className="text-[13px] text-ink-2">
              <b>Hand these credentials to the parents now.</b> Passwords are not stored and cannot be shown again.
              Parents must change the password on first login.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Parent</th>
                  <th className="px-3 py-2">Login ID</th>
                  <th className="px-3 py-2">Password</th>
                  <th className="px-3 py-2">Link valid until</th>
                  <th className="px-3 py-2">Form link</th>
                </tr>
              </thead>
              <tbody>
                {generated.map((g) => (
                  <tr key={g.id} className="border-t border-line">
                    <td className="px-3 py-2 font-semibold">{g.parent_name}</td>
                    <td className="px-3 py-2 font-mono">{g.login_id}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1 font-mono">
                        {g.password}
                        <IconButton name="clipboard" label={`Copy password for ${g.parent_name}`} variant="ghost" onClick={() => copy(`Login ID: ${g.login_id}  Password: ${g.password}`)} />
                      </span>
                    </td>
                    <td className="px-3 py-2"><Badge tone="amber">{fmtDate(g.link_expires_at)}</Badge></td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <a href={g.form_link} target="_blank" rel="noreferrer" className="btn-soft !px-2.5 !py-1 text-xs">
                          Open <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
                        </a>
                        <IconButton name="clipboard" label={`Copy link for ${g.parent_name}`} variant="ghost" onClick={() => copy(g.form_link)} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setGenerated([])}>I have handed these over — hide</Button>
        </div>
      )}
    </div>
  );
}
