"use client";

/**
 * Record-card kit — the building blocks for each page's card view
 * (passed to <TableView cards={...}>).
 *
 * Every page composes its own card from these, so cards differ per page in
 * what they put first (a balance, a net pay, a quota) while sharing one
 * visual language: white surface, 16px radius, hairline border, navy
 * hierarchy, the chart palette for categories and the status palette for
 * state — plus a Lightswind-style interactive layer (ported from
 * lightswind.com InteractiveGradientCard / GlowingCards): a pointer-tracked
 * tone glow, a gradient border ring on hover, halo status dots and glowing
 * meters/rings. All FX are cosmetic; content is fully legible without them
 * and reduced-motion disables the movement entirely.
 */

import { useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";

export type Tone = "navy" | "blue" | "teal" | "sky" | "gold" | "ok" | "warn" | "danger" | "slate";

/** Literal class sets per tone (kept literal so Tailwind can see them). */
const TONES: Record<Tone, { soft: string; text: string; solid: string; rail: string; stroke: string }> = {
  navy: { soft: "bg-brand-50", text: "text-brand-700", solid: "bg-brand-700", rail: "before:bg-brand-700", stroke: "var(--color-chart-1)" },
  blue: { soft: "bg-accent-50", text: "text-accent-700", solid: "bg-accent-500", rail: "before:bg-accent-500", stroke: "var(--color-chart-2)" },
  teal: { soft: "bg-teal-50", text: "text-teal-700", solid: "bg-chart-3", rail: "before:bg-chart-3", stroke: "var(--color-chart-3)" },
  sky: { soft: "bg-info-soft", text: "text-info-ink", solid: "bg-chart-4", rail: "before:bg-chart-4", stroke: "var(--color-chart-4)" },
  gold: { soft: "bg-gold-soft", text: "text-gold-ink", solid: "bg-chart-5", rail: "before:bg-chart-5", stroke: "var(--color-chart-5)" },
  ok: { soft: "bg-ok-soft", text: "text-ok-ink", solid: "bg-ok", rail: "before:bg-ok", stroke: "var(--color-ok)" },
  warn: { soft: "bg-warn-soft", text: "text-warn-ink", solid: "bg-warn", rail: "before:bg-warn", stroke: "var(--color-warn)" },
  danger: { soft: "bg-danger-soft", text: "text-danger-ink", solid: "bg-danger", rail: "before:bg-danger", stroke: "var(--color-danger)" },
  slate: { soft: "bg-surface-2", text: "text-ink-2", solid: "bg-ink-3", rail: "before:bg-line-strong", stroke: "var(--color-line-strong)" },
};

export const toneClasses = (tone: Tone) => TONES[tone];

const SERIES: Tone[] = ["navy", "blue", "teal", "sky", "gold"];

/** Stable category colour: the same subject/class name always gets the same tone. */
export function toneFor(key: string | null | undefined): Tone {
  if (!key) return "slate";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return SERIES[Math.abs(h) % SERIES.length];
}

/** Maps a free-text status onto the status palette. */
export function statusTone(status: string | null | undefined): Tone {
  const s = (status ?? "").toLowerCase();
  if (/(paid|approved|present|active|closed|resolved|sent|delivered|processed|published|returned|completed|graded)/.test(s) && !/unpaid/.test(s)) return "ok";
  if (/(pending|partial|review|draft|late|scheduled|checked.?out|submitted|in.?progress|mocked|not sent)/.test(s)) return "warn";
  if (/(unpaid|rejected|absent|overdue|failed|cancel|inactive|open|expired)/.test(s)) return "danger";
  return "slate";
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").replace(/^(mr|mrs|ms|dr|col|capt)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Pointer FX only make sense with a real hover-capable pointer. */
let hoverable: boolean | null = null;
const canHover = () =>
  (hoverable ??= typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches);

/* ── Layout ───────────────────────────────────────────────────── */

/** Responsive card grid. `min` is the narrowest a card may get before wrapping. */
export function CardGrid({ children, min = "18rem", empty }: { children: ReactNode; min?: string; empty?: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (items.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))` }}>
      {children}
    </div>
  );
}

/** Empty state for a card grid — dashed, quiet, full width. */
export function CardEmpty({ title, hint, icon = "sparkles" }: { title: string; hint?: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span
        className="grid h-12 w-12 place-items-center rounded-xl text-brand-700"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-brand-700) 10%, white)",
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-brand-700) 20%, transparent)",
        }}
      >
        <Icon name={icon} />
      </span>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

/**
 * Card shell — the interactive layer follows the pointer (Lightswind
 * InteractiveGradientCard mechanic, token-colored by `rail`): a soft radial
 * glow tracks the cursor inside the card and a tone gradient border ring
 * fades in on hover. `rail` still draws the 3px state edge on the left.
 * `interactive={false}` opts out of the pointer FX (movement stays off).
 */
export function RecordCard({
  children, rail, className = "", style, interactive = true,
}: { children: ReactNode; rail?: Tone; className?: string; style?: CSSProperties; interactive?: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (reduceMotion || !canHover()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--rc-x", `${Math.round(e.clientX - r.left)}px`);
    el.style.setProperty("--rc-y", `${Math.round(e.clientY - r.top)}px`);
  };

  const glow = TONES[rail ?? "navy"].stroke;
  return (
    <article
      ref={ref}
      onPointerMove={interactive ? onPointerMove : undefined}
      style={{ ...(style ?? {}), "--rc-glow": rail ? glow : "var(--color-accent-500)" } as CSSProperties}
      className={`record-card group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-soft ${
        interactive ? "is-interactive" : ""
      } ${rail ? `before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${TONES[rail].rail}` : ""} ${className}`}
    >
      {children}
      {interactive && <span aria-hidden className="record-card-fx" />}
      {interactive && <span aria-hidden className="record-card-border" />}
    </article>
  );
}

/** Padded body section of a card. */
export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative flex flex-1 flex-col gap-4 px-5 py-4 ${className}`}>{children}</div>;
}

/** Footer action row — flat hairline, lets the glow read through. */
export function CardFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative flex flex-wrap items-center justify-end gap-2 border-t border-line/70 px-5 py-3 ${className}`}>
      {children}
    </div>
  );
}

/** Lead visual + title/subtitle + optional right-side element (badge, amount). */
export function CardTitle({
  lead, title, subtitle, aside,
}: { lead?: ReactNode; title: ReactNode; subtitle?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {lead}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15.5px] font-semibold leading-snug tracking-[-0.005em] text-ink">{title}</h3>
        {subtitle && <p className="mt-1 truncate text-[12.5px] text-ink-3">{subtitle}</p>}
      </div>
      {aside && <div className="shrink-0 pt-0.5">{aside}</div>}
    </div>
  );
}

/* ── Visual atoms ─────────────────────────────────────────────── */

/** Initials / short-code tile. `solid` renders a tone gradient (Lightswind-style). */
export function Monogram({
  text, tone = "navy", size = "md", shape = "rounded", solid = false,
}: { text: string; tone?: Tone; size?: "sm" | "md" | "lg"; shape?: "rounded" | "circle"; solid?: boolean }) {
  const dims = { sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-[13px]", lg: "h-12 w-12 text-[15px]" }[size];
  const c = TONES[tone].stroke;
  return (
    <span
      className={`grid shrink-0 place-items-center font-bold tracking-tight ${dims} ${shape === "circle" ? "rounded-full" : "rounded-xl"} ${
        solid ? "text-white" : `${TONES[tone].soft} ${TONES[tone].text}`
      }`}
      style={
        solid
          ? {
              backgroundImage: `linear-gradient(140deg, ${c}, color-mix(in srgb, ${c} 72%, #0e2340))`,
              boxShadow: `0 3px 10px -2px color-mix(in srgb, ${c} 45%, transparent)`,
            }
          : { boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 20%, transparent)` }
      }
      aria-hidden
    >
      {text}
    </span>
  );
}

/** Icon in a soft tile. */
export function IconTile({ name, tone = "navy", size = "md" }: { name: string; tone?: Tone; size?: "sm" | "md" }) {
  const t = TONES[tone];
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl ${t.soft} ${t.text} ${size === "sm" ? "h-8 w-8" : "h-10 w-10"}`}
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.stroke} 20%, transparent)` }}
      aria-hidden
    >
      <Icon name={name} className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

/** Status pill in the status palette — dot carries a soft halo pulse. */
export function StatusPill({ status, tone }: { status: string; tone?: Tone }) {
  const t = TONES[tone ?? statusTone(status)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${t.soft} ${t.text}`}
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.stroke} 18%, transparent)` }}
    >
      <span className={`status-dot h-1.5 w-1.5 rounded-full ${t.solid}`} aria-hidden />
      {status}
    </span>
  );
}

/** Small label over a value. */
export function Metric({
  label, value, tone, hint, align = "left", size = "md",
}: { label: string; value: ReactNode; tone?: Tone; hint?: ReactNode; align?: "left" | "right"; size?: "md" | "lg" }) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        {tone && (
          <span
            aria-hidden
            className="h-2.5 w-[3px] rounded-full"
            style={{ backgroundColor: TONES[tone].stroke }}
          />
        )}
        {label}
      </p>
      <p className={`tnum mt-0.5 truncate font-semibold ${size === "lg" ? "text-[24px] leading-tight" : "text-[14px]"} ${tone ? TONES[tone].text : "text-ink"}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

/** Horizontal meter with an optional caption row — gradient fill, glow tip,
    scaleX entrance (transform-only; reduced motion ends it immediately). */
export function Meter({
  value, max = 100, tone = "navy", label, caption, height = "h-2",
}: { value: number; max?: number; tone?: Tone; label?: string; caption?: ReactNode; height?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const c = TONES[tone].stroke;
  return (
    <div className="min-w-0">
      {(label || caption) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11.5px]">
          {label && <span className="font-medium text-ink-2">{label}</span>}
          {caption && <span className="tnum font-semibold text-ink">{caption}</span>}
        </div>
      )}
      <div
        className={`${height} overflow-hidden rounded-full bg-line`}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`meter-fill h-full rounded-full ${TONES[tone].solid} transition-[width] duration-700 ease-out`}
          style={{
            width: `${pct}%`,
            backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${c} 40%, transparent), ${c})`,
            boxShadow: `0 0 10px -2px color-mix(in srgb, ${c} 55%, transparent)`,
          }}
        />
      </div>
    </div>
  );
}

/** Radial progress ring with the value in the centre — progress arc glows. */
export function Ring({
  value, tone = "navy", size = 56, stroke = 6, label, children,
}: { value: number; tone?: Tone; size?: number; stroke?: number; label?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONES[tone].stroke} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`}
          style={{
            transition: "stroke-dasharray 0.8s var(--ease-soft)",
            filter: `drop-shadow(0 1px 4px color-mix(in srgb, ${TONES[tone].stroke} 45%, transparent))`,
          }}
        />
      </svg>
      <span className="tnum absolute inset-0 grid place-items-center text-[12px] font-bold text-ink">
        {children ?? `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

/** Small neutral chip for secondary facts (term, room, code). */
export function Chip({ children, icon, tone = "slate" }: { children: ReactNode; icon?: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium ${t.soft} ${t.text}`}
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.stroke} 16%, transparent)` }}
    >
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}
