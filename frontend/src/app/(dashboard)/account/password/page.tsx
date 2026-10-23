"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { Button, Card, CardHead, Field, Icon, Input, PageHeader, useToast } from "@/components/ui";

/** Same rule as the backend ChangePasswordDto: 8–72 chars, upper + lower + digit. */
const RULES: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 && p.length <= 72 },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "digit", label: "A number", test: (p) => /\d/.test(p) },
];

function strength(p: string): { score: number; label: string; tone: string } {
  let score = RULES.filter((r) => r.test(p)).length;
  if (p.length >= 12) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  if (!p) return { score: 0, label: "", tone: "bg-line" };
  if (score <= 2) return { score, label: "Weak", tone: "bg-danger" };
  if (score <= 4) return { score, label: "Okay", tone: "bg-warn" };
  return { score, label: "Strong", tone: "bg-ok" };
}

export default function ChangePasswordPage() {
  const { me, refresh } = useMe();
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const forced = !!me?.must_change_password;
  const allOk = RULES.every((r) => r.test(next));
  const same = next.length > 0 && next === current;
  const matches = confirm.length > 0 && confirm === next;
  const s = strength(next);
  const canSubmit = current.length > 0 && allOk && matches && !same && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      toast.push("Password changed");
      await refresh();
      router.replace(homeFor(me?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader
        icon="lock"
        eyebrow="Account"
        title="Change password"
        subtitle="Choose a password you don't use anywhere else."
      />

      {forced && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn-ink" role="status">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Your account was set up (or reset) with a temporary password. Set your own password to continue —
            the rest of the app opens once this is done.
          </span>
        </div>
      )}

      <Card>
        <CardHead icon="key" title="New password" subtitle={me?.email ?? undefined} />
        <form onSubmit={submit} className="space-y-4 p-5">
          {error && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger" role="alert">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <Field label={forced ? "Temporary / current password" : "Current password"} required>
            <Input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>

          <Field label="New password" required error={same ? "The new password must be different from the current one" : undefined}>
            <Input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={next}
              maxLength={72}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby="pw-rules"
              required
            />
          </Field>

          {next && (
            <div className="flex items-center gap-3" aria-live="polite">
              <div className="flex h-1.5 flex-1 gap-1">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={`h-full flex-1 rounded-full ${i < s.score ? s.tone : "bg-line"}`} />
                ))}
              </div>
              <span className="w-14 text-right text-[11.5px] font-semibold text-ink-2">{s.label}</span>
            </div>
          )}

          <ul id="pw-rules" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {RULES.map((r) => {
              const ok = r.test(next);
              return (
                <li key={r.id} className={`flex items-center gap-2 text-[12px] ${ok ? "text-ok-ink" : "text-ink-3"}`}>
                  <Icon name={ok ? "check" : "minus"} className="h-3.5 w-3.5 shrink-0" />
                  {r.label}
                </li>
              );
            })}
          </ul>

          <Field
            label="Confirm new password"
            required
            error={confirm && !matches ? "The two passwords don't match" : undefined}
          >
            <Input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              maxLength={72}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>

          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show passwords
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {!forced && (
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            )}
            <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>
              <Icon name="check" className="h-4 w-4" />
              Save new password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
