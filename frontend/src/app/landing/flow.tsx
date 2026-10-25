"use client";

/**
 * /landing — "How it flows": a metro-line journey through the school year.
 * Five stations sit on a line that fills as the story advances (auto-plays while on screen,
 * pauses on hover, click any station). The stage card below explains what happens, who is
 * involved, what it produces and what it hands to the next stage. The last stage loops back.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Icon } from "@/components/ui";
import { GeoField } from "./shapes";

const EASE = [0.22, 1, 0.36, 1] as const;
const DWELL = 6500;

type Stage = {
  icon: string; title: string; short: string; tag: string; body: string;
  does: string[]; who: string[]; makes: string[]; from: string; to: string; via: string;
};

export const STAGES: Stage[] = [
  {
    icon: "admissions", title: "Admission", short: "Admit", tag: "Where every story begins",
    body: "Parents apply online. The application moves through each office in order, so nobody chases paperwork.",
    does: ["Online application with document upload", "Office verifies documents and seat", "Admission fee collected online", "Principal approves and a roll number is issued"],
    who: ["Parent", "Office", "Principal"], makes: ["Student record", "Roll number", "Parent login"],
    from: "#3b82f6", to: "#6366f1", via: "Fee plan created for the new student",
  },
  {
    icon: "fees", title: "Fees", short: "Fees", tag: "Money that tracks itself",
    body: "Fee plans turn into invoices on their own. Parents pay from their phone and receipts arrive instantly.",
    does: ["Term invoices raised automatically", "Pay online by UPI, card or net banking", "Receipts sent the moment a payment lands", "Pending dues list updates itself"],
    who: ["Accounts", "Parent"], makes: ["Invoices", "Receipts", "Dues report"],
    from: "#f59e0b", to: "#f97316", via: "Student cleared to start the term",
  },
  {
    icon: "attendance", title: "Daily school life", short: "Daily", tag: "The rhythm of every day",
    body: "Attendance, timetable, hostel roll call and the gate desk run the day, and parents stay in the loop.",
    does: ["Class attendance in a single tap", "Timetable and substitutions for every teacher", "Hostel roll call, gate passes and visitors", "Absence alerts reach parents right away"],
    who: ["Teachers", "Warden", "Security", "Parent"], makes: ["Attendance register", "Gate log", "Alerts"],
    from: "#10b981", to: "#0d9488", via: "Attendance and class work feed into exams",
  },
  {
    icon: "exams", title: "Assessment", short: "Assess", tag: "From marks to report cards",
    body: "Exams and online tests collect marks in one place, and report cards go out with a single publish.",
    does: ["Exam schedules and seating", "Online tests marked automatically", "Teachers enter marks, which are checked and locked", "Report cards published to every parent"],
    who: ["Teachers", "Exam cell", "Student"], makes: ["Marks register", "Report cards", "Rank lists"],
    from: "#8b5cf6", to: "#d946ef", via: "Results flow into school-wide insight",
  },
  {
    icon: "reports", title: "Insight", short: "Insight", tag: "The whole school at a glance",
    body: "Leadership sees attendance, fees and results trends in one view, and every action has an audit trail.",
    does: ["Live dashboards for attendance, fees and results", "Trends by class, section and term", "A full audit trail of every change", "Exports ready for board meetings"],
    who: ["Principal", "Management"], makes: ["Dashboards", "Audit trail", "Exports"],
    from: "#0ea5e9", to: "#2563eb", via: "Promotions open next year's admissions",
  },
];

function Chevron({ dir = "right", className = "" }: { dir?: "left" | "right"; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "right" ? <path d="M7.5 4.5 13 10l-5.5 5.5" /> : <path d="M12.5 4.5 7 10l5.5 5.5" />}
    </svg>
  );
}

function Station({ s, k, active, done, onPick }: { s: Stage; k: number; active: boolean; done: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-current={active ? "step" : undefined} aria-label={`Stage ${k + 1}: ${s.title}`} className="group relative flex min-w-0 flex-col items-center gap-2.5 outline-none">
      <span className="relative grid h-12 w-12 place-items-center sm:h-16 sm:w-16">
        {active && <span aria-hidden className="lp-ping absolute inset-0 rounded-2xl" style={{ background: `${s.from}55` }} />}
        <span
          className={`relative grid h-full w-full place-items-center rounded-2xl transition-all duration-500 group-focus-visible:ring-4 group-focus-visible:ring-accent-500/30 ${active ? "scale-110 text-white shadow-[0_16px_40px_-12px_var(--c)]" : done ? "bg-white text-[var(--c)] ring-2 ring-[var(--c)]" : "bg-white text-ink-3 ring-1 ring-line group-hover:text-ink group-hover:ring-ink-3/40"}`}
          style={{ "--c": s.from, background: active ? `linear-gradient(135deg, ${s.from}, ${s.to})` : undefined } as CSSProperties}
        >
          <Icon name={s.icon} className="h-5 w-5 sm:h-7 sm:w-7" />
        </span>
      </span>
      <span className="text-center leading-tight">
        <span className={`block font-mono text-[10.5px] font-bold tracking-[0.12em] transition-colors sm:text-[11.5px] ${active ? "" : "text-ink-3"}`} style={active ? { color: s.from } : undefined}>{String(k + 1).padStart(2, "0")}</span>
        <span className={`mt-0.5 block text-[12px] font-semibold transition-colors sm:text-[14.5px] ${active ? "text-ink" : "text-ink-2"}`}>
          <span className="sm:hidden">{s.short}</span><span className="hidden sm:inline">{s.title}</span>
        </span>
      </span>
    </button>
  );
}

function Pill({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-[12.5px] font-semibold ${dark ? "bg-white/15 text-white ring-1 ring-white/25" : "bg-surface-2 text-ink ring-1 ring-line"}`}>{children}</span>;
}

export function FlowSection({ head }: { head: ReactNode }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef, { margin: "-20% 0px -20% 0px" });
  const running = inView && !paused;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % STAGES.length), DWELL);
    return () => clearTimeout(t);
  }, [running, active]);

  const s = STAGES[active];
  const next = STAGES[(active + 1) % STAGES.length];
  const last = active === STAGES.length - 1;
  const fill = active / (STAGES.length - 1);
  const go = (i: number) => setActive((i + STAGES.length) % STAGES.length);

  return (
    <section id="flow" className="relative scroll-mt-20 overflow-hidden bg-white py-24 sm:py-32">
      <div aria-hidden className="lp-dots absolute inset-0 opacity-50" />
      <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-[55%] h-[560px] w-[900px] max-w-[140vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]" animate={{ background: `radial-gradient(closest-side, ${s.from}2e, transparent)` }} transition={{ duration: 1 }} />
      <GeoField shapes={[
        { kind: "dashRing", color: "#3b82f6", size: 160, at: "-right-16 top-[12%]", spin: 60, bob: 14, opacity: 0.16 },
        { kind: "triangle", color: "#0d9488", size: 52, at: "left-[5%] top-[14%]", spin: 44, bob: 10, opacity: 0.2, hideMobile: true },
        { kind: "hex", color: "#8b5cf6", size: 60, at: "left-[3%] bottom-[10%]", spin: 40, bob: 12, opacity: 0.16, hideMobile: true },
        { kind: "plus", color: "#f59e0b", size: 24, at: "right-[8%] bottom-[8%]", spin: 22, bob: 8, opacity: 0.45 },
      ]} />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-8">
        {head}

        <div ref={boxRef} className="mx-auto mt-14 max-w-5xl sm:mt-16" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {/* metro line */}
          <div className="relative">
            <div aria-hidden className="absolute left-[10%] right-[10%] top-6 h-[3px] -translate-y-1/2 rounded-full bg-line sm:top-8" />
            <motion.div
              aria-hidden
              className="absolute left-[10%] top-6 h-[3px] -translate-y-1/2 rounded-full sm:top-8"
              style={{ background: `linear-gradient(90deg, ${STAGES.map((x) => x.from).join(", ")})` }}
              animate={{ width: `${fill * 80}%` }}
              transition={{ duration: 0.9, ease: EASE }}
            />
            <motion.span
              aria-hidden
              className="absolute top-6 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white sm:top-8"
              style={{ boxShadow: `0 0 0 3px ${s.from}, 0 0 18px 4px ${s.from}88` }}
              animate={{ left: `${10 + fill * 80}%` }}
              transition={{ duration: 0.9, ease: EASE }}
            />
            <div className="relative grid grid-cols-5">
              {STAGES.map((x, k) => (
                <Station key={x.title} s={x} k={k} active={k === active} done={k < active} onPick={() => go(k)} />
              ))}
            </div>
          </div>

          {/* stage card */}
          <div className="relative mt-10 sm:mt-12">
            <AnimatePresence mode="wait" initial={false}>
              <motion.article
                key={active}
                initial={{ opacity: 0, y: 18, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.985 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="grid grid-cols-1 overflow-hidden rounded-[28px] border border-line bg-white/90 shadow-[0_30px_80px_-40px_rgba(20,43,74,0.45)] backdrop-blur lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
              >
                {/* story */}
                <div className="relative min-w-0 p-6 sm:p-9">
                  <span aria-hidden className="pointer-events-none absolute -bottom-10 -right-3 select-none font-display text-[150px] font-extrabold leading-none tracking-tighter text-transparent sm:text-[190px]" style={{ WebkitTextStroke: `2px ${s.from}22` }}>
                    {String(active + 1).padStart(2, "0")}
                  </span>
                  <p className="relative text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: s.from }}>Stage {active + 1} of {STAGES.length} · {s.tag}</p>
                  <h3 className="relative mt-2 font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[36px]">{s.title}</h3>
                  <p className="relative mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-ink-2 sm:text-[16.5px]">{s.body}</p>
                  <ul className="relative mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {s.does.map((d, i) => (
                      <motion.li
                        key={d}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.12 + i * 0.07, ease: EASE }}
                        className="flex min-w-0 items-start gap-2.5 rounded-2xl bg-surface-2/70 px-3.5 py-3 text-[13.5px] font-medium leading-snug text-ink ring-1 ring-line/70"
                      >
                        <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" style={{ background: s.from }}><Icon name="check" className="h-3 w-3" /></span>
                        <span className="min-w-0">{d}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* context panel */}
                <div className="relative min-w-0 overflow-hidden p-6 text-white sm:p-9" style={{ background: `linear-gradient(150deg, ${s.from}, ${s.to})` }}>
                  <div aria-hidden className="lp-grid absolute inset-0 opacity-25" />
                  <div aria-hidden className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative space-y-6">
                    <div>
                      <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/70">Who's involved</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">{s.who.map((w) => <Pill key={w} dark>{w}</Pill>)}</div>
                    </div>
                    <div>
                      <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/70">What it creates</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">{s.makes.map((m) => <Pill key={m} dark>{m}</Pill>)}</div>
                    </div>
                    <button type="button" onClick={() => go(active + 1)} className="group flex w-full items-center gap-3.5 rounded-2xl bg-white p-3.5 text-left text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${next.from}, ${next.to})` }}>
                        <Icon name={last ? "refresh" : next.icon} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">{last ? "And the cycle continues" : `Hands off to ${next.title}`}</span>
                        <span className="mt-0.5 block text-[13.5px] font-semibold leading-snug">{s.via}</span>
                      </span>
                      <Chevron className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>

          {/* controls */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => go(active - 1)} aria-label="Previous stage" className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink ring-1 ring-line transition hover:ring-ink-3/40"><Chevron dir="left" className="h-4 w-4" /></button>
              <button type="button" onClick={() => go(active + 1)} aria-label="Next stage" className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink ring-1 ring-line transition hover:ring-ink-3/40"><Chevron className="h-4 w-4" /></button>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:max-w-xs">
              <span className="text-[12px] font-semibold text-ink-3">{running ? "Auto-playing" : "Paused"}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                {running && (
                  <motion.span key={active} className="absolute inset-y-0 left-0 rounded-full" style={{ background: s.from }} initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: DWELL / 1000, ease: "linear" }} />
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
