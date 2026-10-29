/** Shared display formatting. One place, so ₹ and dates look identical everywhere. */

/** Indian-grouped rupees: 1250000 → "₹12,50,000". */
export function inr(value: number | null | undefined, opts?: { decimals?: number }): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: opts?.decimals ?? 0,
    maximumFractionDigits: opts?.decimals ?? 0,
  })}`;
}

/** Compact rupees for tight KPI tiles: 1250000 → "₹12.5L". */
export function inrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return inr(value);
}

/** "92.4%" — or an em dash when the value is null. */
export function pct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

/** Relative time for activity feeds. Falls back to a date when older than a month. */
export function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms)) return "";

  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

/** "16 Sep 2026". */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "Tuesday, 16 September 2026". */
export function formatLongDate(input: string | Date = new Date()): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Time-of-day greeting. */
export function greeting(input: Date = new Date()): string {
  const h = input.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * "Mr. Arjun Rao" → "Arjun Rao". Staff records carry the salutation inside the name
 * itself, and every list reads better without it repeated in every row.
 */
export function plainName(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/^(mr|mrs|ms|miss|dr|col|capt|brig|maj)\.?\s+/i, "").trim();
}

/** "Sarah Thomas" → "ST" for avatar fallbacks. */
export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
