"use client";

import { useState } from "react";
import { apiDownload } from "@/lib/api";
import { Button, Icon, useToast } from "@/components/ui";

const FORMATS = [
  { id: "csv", label: "CSV" },
  { id: "xlsx", label: "Excel" },
  { id: "pdf", label: "PDF" },
] as const;

/**
 * CSV / Excel / PDF download for one report view. Goes through apiDownload, so the
 * Bearer token is sent and a 401/403 surfaces as a real error toast instead of a
 * "successful" download of the error body.
 */
export function ExportButtons({ report, query = "", label }: { report: string; query?: string; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (format: string) => {
    setBusy(format);
    try {
      const qs = new URLSearchParams(query);
      qs.set("format", format);
      await apiDownload(`/api/reports/export/${report}?${qs.toString()}`, `${report}.${format}`);
      toast.push(`${label ?? report} exported as ${format.toUpperCase()}`, "success");
    } catch (e) {
      toast.push(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Export ${label ?? report}`}>
      {FORMATS.map((f) => (
        <Button key={f.id} type="button" size="sm" variant="soft" loading={busy === f.id} disabled={!!busy} onClick={() => run(f.id)}>
          <Icon name="download" className="h-3.5 w-3.5" /> {f.label}
        </Button>
      ))}
    </div>
  );
}

export type ExportSpec = { report: string; label: string };

/**
 * One export strip per report card, always in the same place (directly under the
 * card head, right-aligned). Each export gets a caption so two exports in one card
 * ("Fee summary" / "Fee invoices") are told apart; the strip wraps on phones
 * instead of pushing the card wider than the screen.
 */
export function ExportBar({ exports, query = "" }: { exports: ExportSpec[]; query?: string }) {
  if (!exports.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 border-b border-line bg-surface-2/50 px-5 py-2.5 max-md:justify-start max-md:px-4">
      {exports.map((e) => (
        <div key={e.report} className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{exports.length > 1 ? e.label : "Export"}</span>
          <ExportButtons report={e.report} query={query} label={e.label} />
        </div>
      ))}
    </div>
  );
}
