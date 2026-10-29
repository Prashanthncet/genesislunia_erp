"use client";

import { Badge, Button, Icon, Skeleton } from "@/components/ui";

/** Loading skeleton / inline error with retry, for one portal panel. */
export function PanelState({ loading, error, reload, rows = 3 }: {
  loading: boolean; error: string | null; reload?: () => void; rows?: number;
}) {
  if (error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" role="alert">
        <p className="flex items-center gap-2 text-[13px] text-danger">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          {error}
        </p>
        {reload && (
          <Button size="sm" onClick={reload}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-2.5 p-5" aria-busy>
        {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  return null;
}

type Tone = "slate" | "emerald" | "amber" | "rose" | "sky" | "brand";

const TONES: Record<string, Tone> = {
  pending: "amber",
  "warden approved": "sky",
  approved: "emerald",
  paid: "emerald",
  "checked out": "sky",
  "checked in": "emerald",
  returned: "emerald",
  completed: "emerald",
  rejected: "rose",
  cancelled: "slate",
  unpaid: "rose",
  "partially paid": "amber",
  partial: "amber",
  overdue: "rose",
  sent: "emerald",
  mocked: "amber",
  failed: "rose",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status.toLowerCase()] ?? "slate"}>{status}</Badge>;
}

/** "2026-10-21" → "21 Oct 2026" without timezone drift. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** "2026-10-12T07:30:00" / "2026-10-12 07:30" → "12 Oct 2026, 07:30"; other strings pass through. */
export function fmtWhen(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(v);
  return m ? `${fmtDay(m[1])}, ${m[2]}` : v;
}
