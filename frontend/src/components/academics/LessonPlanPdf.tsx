"use client";

import { useRef, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { Button, Icon, useToast } from "@/components/ui";
import { confirmAction } from "@/components/notices/types";

export const LESSON_PDF_MAX = 10 * 1024 * 1024;

export const fmtSize = (n: number | null | undefined) =>
  !n ? "" : n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Client-side pre-check (the server re-checks the bytes): returns an error message or null. */
export function checkLessonPdf(file: File): string | null {
  if (file.size > LESSON_PDF_MAX) return `"${file.name}" is ${fmtSize(file.size)} — the limit is 10 MB`;
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return "Only PDF files can be attached";
  return null;
}

/** Multipart upload to the plan (creates or replaces its PDF). */
export async function uploadLessonPdf(planId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  return apiFetch<{ attachment_name: string; attachment_size: number }>(`/api/academics/lesson-plans/${planId}/attachment`, { method: "POST", body: fd });
}

/** Follows the short-lived signed URL from the API (same contract as student documents). */
export async function openLessonPdf(planId: string) {
  const link = await apiFetch<{ url: string; file_name: string }>(`/api/academics/lesson-plans/${planId}/attachment`);
  const a = document.createElement("a");
  a.href = link.url;
  a.download = link.file_name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type Plan = { id: string; topic: string; date: string; attachmentName?: string | null; attachmentSize?: number | null };

/**
 * Row actions for a lesson plan's PDF: download (anyone who can see plans), attach / replace /
 * remove (the plan's teacher, HOD, leadership), and the plan itself exported as a PDF.
 */
export function LessonPlanPdfActions({ plan, editable, onChanged }: { plan: Plan; editable: boolean; onChanged: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "get" | "up" | "rm" | "export">("");

  const run = async (kind: typeof busy, fn: () => Promise<unknown>, success?: string) => {
    setBusy(kind);
    try {
      await fn();
      if (success) toast.push(success, "success");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Request failed", "error");
    } finally { setBusy(""); }
  };

  const onPick = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    const err = checkLessonPdf(file);
    if (err) return toast.push(err, "error");
    void run("up", async () => { await uploadLessonPdf(plan.id, file); onChanged(); }, plan.attachmentName ? "PDF replaced" : "PDF attached");
  };

  const remove = async () => {
    if (!(await confirmAction({ title: "Remove this PDF?", text: `"${plan.attachmentName}" will be deleted from the lesson plan.`, confirm: "Remove PDF", danger: true }))) return;
    void run("rm", async () => { await apiFetch(`/api/academics/lesson-plans/${plan.id}/attachment`, { method: "DELETE" }); onChanged(); }, "PDF removed");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {plan.attachmentName ? (
        <Button type="button" size="sm" variant="soft" loading={busy === "get"} onClick={() => run("get", () => openLessonPdf(plan.id))}
          title={`${plan.attachmentName} · ${fmtSize(plan.attachmentSize)}`} aria-label={`Download PDF ${plan.attachmentName}`}>
          <Icon name="download" className="h-3.5 w-3.5" />
          <span className="max-w-[9rem] truncate">{plan.attachmentName}</span>
          <span className="tnum text-[11px] text-ink-3">{fmtSize(plan.attachmentSize)}</span>
        </Button>
      ) : null}
      {editable && (
        <>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="ghost" loading={busy === "up"} onClick={() => input.current?.click()} aria-label={`${plan.attachmentName ? "Replace" : "Attach"} PDF for ${plan.topic}`}>
            <Icon name="upload" className="h-3.5 w-3.5" /> {plan.attachmentName ? "Replace PDF" : "Attach PDF"}
          </Button>
          {plan.attachmentName && (
            <Button type="button" size="sm" variant="ghost" loading={busy === "rm"} onClick={remove} aria-label={`Remove PDF from ${plan.topic}`}>
              <Icon name="x" className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </>
      )}
      <Button type="button" size="sm" variant="ghost" loading={busy === "export"}
        onClick={() => run("export", () => apiDownload(`/api/academics/lesson-plans/${plan.id}/plan.pdf`, `lesson-plan-${plan.date}.pdf`))}
        aria-label={`Export lesson plan ${plan.topic} as PDF`}>
        <Icon name="print" className="h-3.5 w-3.5" /> Export
      </Button>
    </div>
  );
}
