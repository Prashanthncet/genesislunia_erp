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
        <Button key={f.id} size="sm" variant="soft" loading={busy === f.id} disabled={!!busy} onClick={() => run(f.id)}>
          <Icon name="download" className="h-3.5 w-3.5" /> {f.label}
        </Button>
      ))}
    </div>
  );
}
