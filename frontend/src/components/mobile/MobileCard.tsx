"use client";

import type { ReactNode } from "react";
import { Icon, useToast } from "@/components/ui";
import { TONES, initials, type Tone } from "@/components/RecordCard";

/**
 * Building blocks for the phone-only record cards (students, gate passes, roll call,
 * payslips). Rendered through TableView `mobileCards`, so desktop never sees them.
 * One visual language: 20px radius surface, soft corner wash, 16px padding, tinted
 * chips with icons, inset info panels, 44px actions.
 */

export function MCard({ children, tone = "navy", wash = true }: { children: ReactNode; tone?: Tone; wash?: boolean }) {
  return (
    <article className="relative overflow-hidden rounded-[20px] border border-line bg-surface p-4 shadow-soft">
      {wash && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-28 w-40 rotate-[-18deg] rounded-[48px] opacity-70"
          style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${TONES[tone].stroke} 14%, transparent), transparent 70%)` }}
        />
      )}
      <div className="relative">{children}</div>
    </article>
  );
}

/** Initials avatar: "solid" = gradient disc (people lists), "soft" = tinted tile. */
export function MAvatar({
  name, tone = "navy", size = 56, shape = "circle", variant = "solid", dot,
}: { name: string; tone?: Tone; size?: number; shape?: "circle" | "rounded"; variant?: "solid" | "soft"; dot?: Tone }) {
  const t = TONES[tone];
  const radius = shape === "circle" ? "rounded-full" : "rounded-2xl";
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      <span
        className={`grid h-full w-full place-items-center font-bold tracking-tight ${radius} ${variant === "soft" ? `${t.soft} ${t.text}` : "text-white"}`}
        style={{
          fontSize: Math.round(size * 0.34),
          background: variant === "solid" ? `linear-gradient(140deg, color-mix(in srgb, ${t.stroke} 70%, white), ${t.stroke})` : undefined,
          boxShadow: variant === "solid" ? `0 6px 16px -6px color-mix(in srgb, ${t.stroke} 60%, transparent)` : undefined,
        }}
      >
        {initials(name)}
      </span>
      {dot && <span aria-hidden className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-surface ${TONES[dot].solid}`} />}
    </span>
  );
}

/** Tinted chip with a leading icon (Class / Roll / House / type …). */
export function MChip({ icon, tone = "slate", children }: { icon?: string; tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-xl px-3 text-[13px] font-medium ${t.soft} ${t.text}`}>
      {icon && <Icon name={icon} className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Small uppercase field label. */
export function MLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{children}</p>;
}

/** Inset panel (contact block, times grid, money panels). */
export function MPanel({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return (
    <div className={`rounded-2xl border border-line ${tone ? TONES[tone].soft : "bg-surface-2/60"}`}>{children}</div>
  );
}

/** Contact row inside an MPanel: icon tile · value (tap to call/mail) · copy button. */
export function MCopyRow({ icon, value, href }: { icon: string; value: string; href?: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.push("Copied to clipboard", "success");
    } catch {
      toast.push("Couldn't copy on this device", "error");
    }
  };
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-accent-600 ring-1 ring-line">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      {href ? (
        <a href={href} className="min-w-0 flex-1 break-all text-[14px] text-ink">{value}</a>
      ) : (
        <span className="min-w-0 flex-1 break-all text-[14px] text-ink">{value}</span>
      )}
      <button type="button" onClick={copy} aria-label={`Copy ${value}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-3 active:bg-surface">
        <Icon name="copy" className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

/** Label + icon + value cell for 2×2 time / money grids. */
export function MStat({ label, value, icon, strong, tone }: { label: string; value: ReactNode; icon?: string; strong?: boolean; tone?: Tone }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <MLabel>{label}</MLabel>
      <p className={`mt-1 flex items-center gap-2 ${strong ? "text-[24px] font-bold leading-tight" : "text-[15px] font-semibold"} ${tone ? TONES[tone].text : "text-ink"}`}>
        {icon && <Icon name={icon} className="h-4 w-4 shrink-0 text-ink-3" />}
        <span className="tnum min-w-0 truncate">{value}</span>
      </p>
    </div>
  );
}
