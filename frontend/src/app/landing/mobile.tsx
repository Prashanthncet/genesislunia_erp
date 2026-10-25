"use client";

/**
 * /landing on phones and tablets (< lg): its own design, mixing dark and light sections.
 * Dark hero with stats, then a swipeable phone showcase (swipe, tap a tab or the arrows; it
 * auto-plays and pauses when touched) that pushes iOS-style through five real ERP screens,
 * then modules, a role carousel, the flow timeline, trust, FAQ and a dark closing card.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type PanInfo } from "motion/react";
import { Icon } from "@/components/ui";
import { STAGES } from "./flow";
import { FAQ, PILLARS } from "./sections";

const EASE = [0.22, 1, 0.36, 1] as const;
const PUSH = { type: "spring", stiffness: 220, damping: 32, mass: 1 } as const;

/* ── phone screens (each animates its own content when shown) ── */

function ScreenHeader({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div className="px-4 pb-3 pt-2">
      <p className="text-[11px] font-semibold" style={{ color }}>{sub}</p>
      <p className="text-[19px] font-bold tracking-tight text-ink">{title}</p>
    </div>
  );
}

const enter = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.25 + i * 0.07, duration: 0.5, ease: EASE } });

function AttendanceScreen() {
  const rows = ["01", "02", "03", "04", "05", "06", "07"];
  const [marked, setMarked] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMarked((m) => (m < rows.length ? m + 1 : m)), 260);
    return () => clearInterval(t);
  }, [rows.length]);
  return (
    <div>
      <ScreenHeader title="Mark attendance" sub="Class 8B · Period 1" color="#059669" />
      <div className="space-y-1.5 px-3">
        {rows.map((r, i) => {
          const absent = r === "05";
          const done = i < marked;
          return (
            <motion.div key={r} {...enter(i)} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
              <span className="text-[12.5px] font-semibold text-ink">Roll {r}</span>
              <span className="flex gap-1">
                {["P", "A"].map((x) => {
                  const on = done && ((x === "P" && !absent) || (x === "A" && absent));
                  return (
                    <span key={x} className={`grid h-6 w-6 place-items-center rounded-lg text-[10.5px] font-bold transition-colors duration-300 ${on ? (x === "P" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white") : "bg-white text-ink-3 ring-1 ring-line"}`}>{x}</span>
                  );
                })}
              </span>
            </motion.div>
          );
        })}
      </div>
      <motion.div {...enter(8)} className="mx-3 mt-3 rounded-xl bg-emerald-500 py-2.5 text-center text-[12.5px] font-bold text-white">Save · 32 of 34 present</motion.div>
    </div>
  );
}

function FeesScreen() {
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPaid(true), 1300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div>
      <ScreenHeader title="Pay fees" sub="Term 2 · due this week" color="#d97706" />
      <motion.div {...enter(0)} className="mx-3 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white">
        <p className="text-[11px] font-semibold text-white/80">Amount due</p>
        <p className="mt-0.5 text-[26px] font-extrabold tracking-tight">₹12,875</p>
      </motion.div>
      <div className="mt-3 space-y-1.5 px-3">
        {["UPI", "Card", "Net banking"].map((m, i) => (
          <motion.div key={m} {...enter(i + 1)} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-[12.5px] font-semibold ${i === 0 ? "bg-amber-50 text-ink ring-1 ring-amber-300" : "bg-surface-2 text-ink-2"}`}>
            {m}<span className={`h-3.5 w-3.5 rounded-full ${i === 0 ? "border-[4px] border-amber-500 bg-white" : "border border-line bg-white"}`} />
          </motion.div>
        ))}
      </div>
      <div className="relative mx-3 mt-4 h-[92px]">
        <AnimatePresence mode="wait">
          {paid ? (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: EASE }} className="flex h-full flex-col items-center justify-center rounded-2xl bg-emerald-50">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="h-5 w-5" /></span>
              <p className="mt-1.5 text-[12.5px] font-bold text-emerald-700">Paid · receipt sent</p>
            </motion.div>
          ) : (
            <motion.div key="pay" exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex h-full items-start">
              <div className="w-full rounded-xl bg-ink py-2.5 text-center text-[12.5px] font-bold text-white">Pay ₹12,875</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function GateScreen() {
  const steps: [string, string][] = [["Requested", "Parent · 3:10 pm"], ["Warden approved", "3:14 pm"], ["Principal approved", "3:16 pm"], ["Code sent to parent", "Verify at the gate"]];
  const [done, setDone] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDone((d) => (d < steps.length ? d + 1 : d)), 450);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div>
      <ScreenHeader title="Gate pass" sub="Leave early · today" color="#0284c7" />
      <div className="px-4">
        {steps.map(([t, s], i) => (
          <motion.div key={t} {...enter(i)} className="relative flex gap-3 pb-3.5">
            {i < steps.length - 1 && <span className={`absolute left-[11px] top-6 h-[calc(100%-18px)] w-[2px] transition-colors duration-500 ${i < done - 1 ? "bg-sky-500" : "bg-line"}`} />}
            <span className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-500 ${i < done ? "bg-sky-500 text-white" : "bg-white text-ink-3 ring-1 ring-line"}`}><Icon name="check" className="h-3.5 w-3.5" /></span>
            <div><p className="text-[12.5px] font-bold text-ink">{t}</p><p className="text-[11px] text-ink-3">{s}</p></div>
          </motion.div>
        ))}
      </div>
      <motion.div {...enter(5)} className="mx-3 mt-1 rounded-2xl bg-sky-50 p-3 text-center">
        <p className="text-[10.5px] font-semibold text-sky-700">Security verifies</p>
        <p className="mt-1 font-mono text-[24px] font-bold tracking-[0.3em] text-ink">4829</p>
      </motion.div>
    </div>
  );
}

function TimetableScreen() {
  const periods: [string, string, string][] = [["9:00", "Mathematics", "Room 12"], ["9:45", "Science", "Lab 2"], ["10:30", "English", "Room 12"], ["11:30", "Social studies", "Room 8"], ["12:15", "Computer", "Lab 1"]];
  return (
    <div>
      <ScreenHeader title="Today" sub="Thursday · Class 8B" color="#4f46e5" />
      <div className="space-y-1.5 px-3">
        {periods.map(([t, s, r], i) => {
          const now = i === 1;
          return (
            <motion.div key={t} {...enter(i)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${now ? "bg-indigo-500 text-white shadow-[0_10px_20px_-12px_#4f46e5]" : "bg-surface-2"}`}>
              <span className={`w-10 text-[11px] font-bold ${now ? "text-white/80" : "text-ink-3"}`}>{t}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[12.5px] font-bold ${now ? "" : "text-ink"}`}>{s}</span>
                <span className={`block text-[10.5px] ${now ? "text-white/75" : "text-ink-3"}`}>{r}</span>
              </span>
              {now && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">Now</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ReportScreen() {
  const subs: [string, number][] = [["Mathematics", 92], ["Science", 86], ["English", 78], ["Social studies", 88], ["Hindi", 81]];
  return (
    <div>
      <ScreenHeader title="Report card" sub="Term 2 · published" color="#7c3aed" />
      <motion.div {...enter(0)} className="mx-3 flex items-center justify-between rounded-2xl bg-violet-50 p-3">
        <div><p className="text-[10.5px] font-semibold text-violet-700">Overall</p><p className="text-[22px] font-extrabold tracking-tight text-ink">85%</p></div>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-violet-500 text-[15px] font-extrabold text-white">A</span>
      </motion.div>
      <div className="mt-3 space-y-2.5 px-4">
        {subs.map(([s, v], i) => (
          <motion.div key={s} {...enter(i + 1)}>
            <div className="flex justify-between text-[11.5px] font-semibold text-ink-2"><span>{s}</span><span className="text-ink">{v}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-violet-100">
              <motion.div className="h-full rounded-full bg-violet-500" initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ delay: 0.4 + i * 0.08, duration: 0.8, ease: EASE }} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const SCREENS: { key: string; title: string; line: string; color: string; tint: string; Screen: () => ReactNode }[] = [
  { key: "att", title: "Attendance in a minute", line: "Teachers mark a whole class with a few taps.", color: "#059669", tint: "#ecfdf5", Screen: AttendanceScreen },
  { key: "fee", title: "Fees paid from the sofa", line: "Parents pay online and get the receipt instantly.", color: "#d97706", tint: "#fffbeb", Screen: FeesScreen },
  { key: "gate", title: "A gate that can't be fooled", line: "Warden, principal, then a code only the parent has.", color: "#0284c7", tint: "#f0f9ff", Screen: GateScreen },
  { key: "tt", title: "Everyone knows what's next", line: "Today's periods, rooms and substitutions.", color: "#4f46e5", tint: "#eef2ff", Screen: TimetableScreen },
  { key: "rc", title: "Report cards in one publish", line: "Marks become report cards parents can open.", color: "#7c3aed", tint: "#f5f3ff", Screen: ReportScreen },
];

/* ── shared bits ── */

function PhoneFrame({ children }: { children: ReactNode }) {
  // the screen is designed at 290x600 and scaled to whatever height the viewport allows
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientHeight / 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-[290/600] h-[min(560px,60svh)]">
      <div className="absolute left-0 top-0 h-[600px] w-[290px] origin-top-left" style={{ transform: `scale(${scale})` }}>
        <div className="h-full w-full rounded-[46px] bg-[#0f172a] p-[9px] shadow-[0_50px_100px_-40px_rgba(15,23,42,0.6)] ring-1 ring-white/10">
          <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-white">
            <div className="relative flex items-center justify-between px-6 pt-3 text-[11px] font-semibold text-ink">
              <span>9:41</span>
              <span className="absolute left-1/2 top-2.5 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-[#0f172a]" />
              <span className="h-2 w-3.5 rounded-[3px] border border-ink/60" />
            </div>
            <div className="relative mt-5 h-[calc(100%-40px)] overflow-hidden">{children}</div>
            <div className="absolute bottom-2 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-ink/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FadeUp({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={`will-change-transform ${className}`} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.9, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

function Head({ kicker, title, sub, dark = false }: { kicker: string; title: ReactNode; sub?: string; dark?: boolean }) {
  return (
    <div>
      <FadeUp><p className={`text-[12px] font-bold uppercase tracking-[0.16em] ${dark ? "text-sky-300" : "text-accent-600"}`}>{kicker}</p></FadeUp>
      <FadeUp delay={0.08}><h2 className={`mt-2 font-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] ${dark ? "text-white" : "text-ink"}`}>{title}</h2></FadeUp>
      {sub && <FadeUp delay={0.16}><p className={`mt-2.5 text-[15px] leading-relaxed ${dark ? "text-white/65" : "text-ink-2"}`}>{sub}</p></FadeUp>}
    </div>
  );
}

function Glow({ className }: { className: string }) {
  return <div aria-hidden className={`pointer-events-none absolute rounded-full blur-[90px] ${className}`} />;
}

/* ── swipeable phone showcase ── */

const TABS = ["Attendance", "Fees", "Gate pass", "Timetable", "Report card"];

function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-25% 0px -25% 0px" });
  const [[i, dir], setPage] = useState<[number, number]>([0, 1]);
  const [held, setHeld] = useState(false);
  const go = (to: number) => setPage(([cur]) => [(to + SCREENS.length) % SCREENS.length, to >= cur ? 1 : -1]);
  const touch = () => { setHeld(true); };

  useEffect(() => {
    if (!inView || held) return;
    const t = setTimeout(() => go(i + 1), 4200);
    return () => clearTimeout(t);
  }, [inView, held, i]);
  useEffect(() => {
    if (!held) return;
    const t = setTimeout(() => setHeld(false), 9000);
    return () => clearTimeout(t);
  }, [held, i]);

  const end = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -350) { touch(); go(i + 1); }
    else if (info.offset.x > 50 || info.velocity.x > 350) { touch(); go(i - 1); }
  };
  const s = SCREENS[i];
  const S = s.Screen;

  return (
    <section ref={ref} className="relative overflow-hidden bg-white px-5 py-14">
      <AnimatePresence initial={false}>
        <motion.div key={s.key} aria-hidden className="pointer-events-none absolute inset-0 will-change-[opacity]" style={{ background: `linear-gradient(180deg, #ffffff, ${s.tint})` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: "easeInOut" }} />
      </AnimatePresence>
      <Head kicker="See it in action" title={<>The app your school <span className="lp-gradient-text-dark">actually uses.</span></>} />

      {/* tabs */}
      <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t, k) => (
          <button key={t} type="button" onClick={() => { touch(); go(k); }} className={`relative shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${k === i ? "text-white" : "bg-white text-ink-2 ring-1 ring-line"}`}>
            {k === i && <motion.span layoutId="m-show-tab" className="absolute inset-0 rounded-full" style={{ background: s.color }} transition={{ type: "spring", stiffness: 380, damping: 34 }} />}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      {/* phone */}
      <div className="relative mt-8 flex justify-center">
        <AnimatePresence initial={false}>
          <motion.div key={s.key} aria-hidden className="absolute left-1/2 top-1/2 h-[70%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[60px] will-change-[opacity]" style={{ backgroundColor: `${s.color}40` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: "easeInOut" }} />
        </AnimatePresence>
        <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.35} onDragStart={touch} onDragEnd={end} whileDrag={{ scale: 0.98 }} className="relative cursor-grab touch-pan-y active:cursor-grabbing">
          <PhoneFrame>
            <AnimatePresence initial={false} custom={dir}>
              <motion.div
                key={s.key}
                custom={dir}
                variants={{ in: (d: number) => ({ x: d > 0 ? "100%" : "-30%", opacity: d > 0 ? 1 : 0.5 }), on: { x: 0, opacity: 1 }, out: (d: number) => ({ x: d > 0 ? "-30%" : "100%", opacity: d > 0 ? 0.5 : 1 }) }}
                initial="in" animate="on" exit="out"
                transition={PUSH}
                className="absolute inset-0 bg-white will-change-transform"
              >
                <S />
              </motion.div>
            </AnimatePresence>
          </PhoneFrame>
        </motion.div>
        {/* side arrows */}
        {[-1, 1].map((d) => (
          <button key={d} type="button" aria-label={d < 0 ? "Previous screen" : "Next screen"} onClick={() => { touch(); go(i + d); }} className={`absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-[0_8px_20px_-8px_rgba(15,23,42,0.4)] ring-1 ring-line ${d < 0 ? "left-0" : "right-0"}`}>
            <svg viewBox="0 0 20 20" className={`h-4 w-4 ${d < 0 ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>
          </button>
        ))}
      </div>

      {/* caption */}
      <div className="relative mt-7 h-[70px] text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={s.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
            <p className="font-display text-[20px] font-bold tracking-tight text-ink">{s.title}</p>
            <p className="mt-1 text-[14px] text-ink-2">{s.line}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="relative mt-1 flex items-center justify-center gap-1.5">
        {SCREENS.map((x, k) => (
          <button key={x.key} type="button" aria-label={TABS[k]} onClick={() => { touch(); go(k); }} className="grid h-5 place-items-center">
            <motion.span className="block h-1.5 rounded-full" animate={{ width: k === i ? 24 : 6, backgroundColor: k === i ? s.color : "rgba(15,23,42,0.2)" }} transition={{ type: "spring", stiffness: 300, damping: 30 }} />
          </button>
        ))}
      </div>
      <p className="relative mt-3 text-center text-[12px] font-medium text-ink-3">{held ? "Swipe the phone to explore" : "Swipe the phone · auto-playing"}</p>
    </section>
  );
}

/* ── content ── */

const STATS: [string, string][] = [["20+", "Connected modules"], ["16", "Roles"], ["6", "Portals"], ["100%", "Mobile-ready"]];

const MODS: [string, string, string, string][] = [
  ["admissions", "Admissions", "Online forms, documents and roll numbers", "#6366f1"],
  ["attendance", "Attendance", "Class roll call in a single tap", "#10b981"],
  ["timetable", "Timetable", "Periods, rooms and substitutions", "#0ea5e9"],
  ["exams", "Exams & reports", "Marks to report cards in one publish", "#8b5cf6"],
  ["fees", "Fees", "Invoices, online payment, instant receipts", "#f59e0b"],
  ["hostel", "Hostel", "Rooms, beds and night roll call", "#0d9488"],
  ["door", "Gate desk", "Passes verified with a parent's code", "#475569"],
  ["staff", "Staff & payroll", "Leave, salaries and payslips", "#2563eb"],
  ["cbt", "Online tests", "Auto-marked tests on any device", "#d946ef"],
  ["academics", "Lesson plans", "Plans, assignments and marks entry", "#14b8a6"],
  ["discipline", "Safeguarding", "Incidents handled with care", "#e11d48"],
  ["bell", "Notices", "Announcements to the right people", "#eab308"],
];

type Role = { id: string; label: string; icon: string; head: string; points: readonly string[] };

const LINKS: Record<string, string[]> = {
  Admissions: ["Fees", "Attendance", "Hostel"],
  Attendance: ["Timetable", "Exams & reports", "Notices"],
  Timetable: ["Attendance", "Lesson plans", "Staff & payroll"],
  "Exams & reports": ["Online tests", "Attendance", "Notices"],
  Fees: ["Admissions", "Notices", "Hostel"],
  Hostel: ["Gate desk", "Fees", "Attendance"],
  "Gate desk": ["Hostel", "Safeguarding", "Notices"],
  "Staff & payroll": ["Timetable", "Attendance", "Notices"],
  "Online tests": ["Exams & reports", "Lesson plans"],
  "Lesson plans": ["Timetable", "Online tests", "Exams & reports"],
  Safeguarding: ["Gate desk", "Hostel", "Notices"],
  Notices: ["Attendance", "Fees", "Exams & reports"],
};

function Modules() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px -20% 0px" });
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!inView || held) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % MODS.length), 2800);
    return () => clearTimeout(t);
  }, [inView, held, active]);
  useEffect(() => {
    if (!held) return;
    const t = setTimeout(() => setHeld(false), 8000);
    return () => clearTimeout(t);
  }, [held, active]);
  const pick = (k: number) => { setHeld(true); setActive(k); };

  const outer = MODS.slice(0, 8);
  const inner = MODS.slice(8);
  const [icon, name, desc, color] = MODS[active];

  const ring = (items: typeof MODS, offset: number, radius: number, spin: string, reverse: boolean) => (
    <div className="lp-spin absolute inset-0 will-change-transform" style={{ "--spin": spin, animationDirection: reverse ? "reverse" : "normal" } as CSSProperties}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {items.map((m, k) => {
          const a = (k / items.length) * Math.PI * 2;
          const on = offset + k === active;
          return <line key={m[1]} x1="50" y1="50" x2={50 + radius * Math.cos(a)} y2={50 + radius * Math.sin(a)} stroke={on ? m[3] : "rgba(20,43,74,0.12)"} strokeWidth={on ? 0.8 : 0.4} strokeDasharray={on ? "2 2" : undefined} className={on ? "lp-pulse" : undefined} style={{ transition: "stroke 0.4s", animationDuration: "40s" }} />;
        })}
      </svg>
      {items.map((m, k) => {
        const a = (k / items.length) * Math.PI * 2;
        const on = offset + k === active;
        return (
          <button
            key={m[1]}
            type="button"
            aria-label={m[1]}
            onClick={() => pick(offset + k)}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${50 + radius * Math.cos(a)}%`, top: `${50 + radius * Math.sin(a)}%` }}
          >
            <span className="lp-spin block" style={{ "--spin": spin, animationDirection: reverse ? "normal" : "reverse" } as CSSProperties}>
              <motion.span
                animate={{ scale: on ? 1.18 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="grid h-11 w-11 place-items-center rounded-2xl text-white"
                style={{ background: `linear-gradient(135deg, ${m[3]}, ${m[3]}bb)`, boxShadow: on ? `0 0 0 4px #fff, 0 0 0 6px ${m[3]}, 0 14px 28px -10px ${m[3]}` : "0 8px 18px -10px rgba(20,43,74,0.6)" }}
              >
                <Icon name={m[0]} className="h-5 w-5" />
              </motion.span>
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <section ref={ref} className="relative overflow-hidden bg-white px-5 py-14">
      <div aria-hidden className="lp-dots absolute inset-0 opacity-40" />
      <div className="relative">
        <Head kicker="Everything connected" title={<>Every corner of the school, <span className="lp-gradient-text-dark">around one record.</span></>} sub="Twelve modules share the same student record. Tap any of them." />
      </div>

      {/* hub */}
      <div className="relative mx-auto mt-8 aspect-square w-full max-w-[360px]">
        <AnimatePresence initial={false}>
          <motion.div key={name} aria-hidden className="absolute inset-[18%] rounded-full blur-3xl will-change-[opacity]" style={{ backgroundColor: `${color}30` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8, ease: "easeInOut" }} />
        </AnimatePresence>
        <div aria-hidden className="absolute inset-[6%] rounded-full border border-dashed border-ink/10" />
        <div aria-hidden className="absolute inset-[29%] rounded-full border border-dashed border-ink/10" />
        {ring(outer, 0, 44, "70s", false)}
        {ring(inner, 8, 21, "50s", true)}
        {/* core */}
        <div className="absolute left-1/2 top-1/2 grid h-[27%] w-[27%] -translate-x-1/2 -translate-y-1/2 place-items-center">
          <span aria-hidden className="lp-ping absolute inset-0 rounded-full bg-accent-500/20" />
          <span className="relative grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-[#0b1f3d] to-[#14306a] text-center shadow-[0_18px_40px_-14px_rgba(7,22,48,0.8)] ring-4 ring-white">
            <span>
              <span className="mx-auto block w-fit text-sky-300"><Icon name="user" className="h-5 w-5" /></span>
              <span className="mt-0.5 block text-[10px] font-bold leading-tight text-white">Student<br />record</span>
            </span>
          </span>
        </div>
      </div>

      {/* detail */}
      <div className="relative mt-6 min-h-[150px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }} className="rounded-[24px] bg-white p-4 shadow-[0_24px_50px_-28px_rgba(20,43,74,0.55)] ring-1 ring-line">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}><Icon name={icon} className="h-6 w-6" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold leading-tight text-ink">{name}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{desc}</p>
              </div>
              <span className="shrink-0 font-mono text-[11px] font-bold text-ink-3">{String(active + 1).padStart(2, "0")}/{MODS.length}</span>
            </div>
            <div className="mt-3.5 border-t border-line pt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">Shares data with</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(LINKS[name] ?? []).map((l) => {
                  const k = MODS.findIndex((m) => m[1] === l);
                  const c = MODS[k]?.[3] ?? "#64748b";
                  return (
                    <button key={l} type="button" onClick={() => k >= 0 && pick(k)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: `${c}14`, color: c }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{l}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="relative mt-3 text-center text-[12px] font-medium text-ink-3">{held ? "Tap any module to explore" : "Cycling through modules · tap one"}</p>
    </section>
  );
}

const ROLE_COLORS = ["#3b82f6", "#10b981", "#0d9488", "#475569", "#f59e0b", "#d946ef", "#8b5cf6", "#0ea5e9"];

function DeckCard({ r, depth, color, n, total, onSwipe }: { r: Role; depth: number; color: string; n: number; total: number; onSwipe: (d: number) => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-12, 12]);
  const top = depth === 0;
  return (
    <motion.div
      custom={0}
      initial={{ scale: 0.84, y: 42, opacity: 0 }}
      animate={{ scale: 1 - depth * 0.06, y: depth * 16, opacity: depth > 2 ? 0 : 1 - depth * 0.25 }}
      exit={{ x: x.get() < 0 ? -420 : 420, rotate: x.get() < 0 ? -18 : 18, opacity: 0, transition: { duration: 0.35, ease: EASE } }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      style={{ x: top ? x : 0, rotate: top ? rotate : 0, zIndex: 10 - depth }}
      drag={top ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 500) onSwipe(info.offset.x < 0 ? 1 : -1); }}
      className={`absolute inset-0 overflow-hidden rounded-[28px] bg-white p-5 will-change-transform shadow-[0_30px_60px_-28px_rgba(0,0,0,0.75)] ${top ? "cursor-grab touch-pan-y active:cursor-grabbing" : "pointer-events-none"}`}
    >
      <div aria-hidden className="absolute -right-16 -top-16 h-44 w-44 rounded-full blur-2xl" style={{ background: `${color}30` }} />
      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-bold" style={{ background: `${color}15`, color }}>
          <Icon name={r.icon} className="h-4 w-4" />{r.label}
        </span>
        <span className="font-mono text-[11px] font-bold text-ink-3">{String(n + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}</span>
      </div>
      <p className="relative mt-4 font-display text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">{r.head}</p>
      <ul className="relative mt-4 space-y-2.5">
        {r.points.map((p, k) => (
          <motion.li key={p} initial={false} animate={top ? { opacity: 1, x: 0 } : { opacity: 0.5, x: 0 }} transition={{ delay: top ? 0.1 + k * 0.06 : 0, duration: 0.4, ease: EASE }} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
            <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" style={{ background: color }}><Icon name="check" className="h-3 w-3" /></span>{p}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

function Roles({ roles }: { roles: readonly Role[] }) {
  const [i, setI] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const go = (to: number) => setI((to + roles.length) % roles.length);
  useEffect(() => {
    const el = strip.current?.children[i] as HTMLElement | undefined;
    if (el && strip.current) strip.current.scrollTo({ left: el.offsetLeft - strip.current.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [i]);
  const deck = [0, 1, 2].map((d) => ({ d, k: (i + d) % roles.length }));

  return (
    <section className="relative overflow-hidden bg-[#071630] py-14">
      <div aria-hidden className="pointer-events-none absolute inset-0"><div className="lp-aurora lp-a2 opacity-60" /><div className="lp-grid absolute inset-0 opacity-40" /></div>
      <div className="relative px-5">
        <Head dark kicker="Built for every role" title={<>The right screen <span className="lp-gradient-text">for every person.</span></>} sub="Tap a role, or swipe the card away to meet the next one." />
      </div>

      {/* stories row */}
      <div ref={strip} className="relative mt-7 flex gap-3.5 overflow-x-auto px-5 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {roles.map((r, k) => {
          const on = k === i;
          const c = ROLE_COLORS[k % ROLE_COLORS.length];
          return (
            <button key={r.id} type="button" onClick={() => go(k)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <span className="relative grid h-16 w-16 place-items-center rounded-full p-[2.5px] transition-all duration-300" style={{ background: on ? `conic-gradient(${c}, #38bdf8, #a78bfa, ${c})` : "rgba(255,255,255,0.15)" }}>
                <span className="grid h-full w-full place-items-center rounded-full bg-[#0b1f3d] ring-2 ring-[#071630]">
                  <motion.span animate={{ scale: on ? 1.1 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="grid h-11 w-11 place-items-center rounded-full text-white" style={{ background: on ? `linear-gradient(135deg, ${c}, ${c}aa)` : "rgba(255,255,255,0.08)" }}>
                    <Icon name={r.icon} className="h-5 w-5" />
                  </motion.span>
                </span>
              </span>
              <span className={`text-[11.5px] font-semibold transition-colors ${on ? "text-white" : "text-white/55"}`}>{r.label}</span>
            </button>
          );
        })}
      </div>

      {/* card deck */}
      <div className="relative mx-5 mt-6 h-[360px]">
        <AnimatePresence initial={false}>
          {deck.slice().reverse().map(({ d, k }) => (
            <DeckCard key={roles[k].id} r={roles[k]} depth={d} n={k} total={roles.length} color={ROLE_COLORS[k % ROLE_COLORS.length]} onSwipe={(dir) => go(i + dir)} />
          ))}
        </AnimatePresence>
      </div>

      <div className="relative mt-12 flex items-center justify-center gap-3 px-5">
        <button type="button" onClick={() => go(i - 1)} aria-label="Previous role" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 active:scale-95">
          <svg viewBox="0 0 20 20" className="h-4 w-4 rotate-180" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>
        </button>
        <span className="text-[12.5px] font-medium text-white/55">Swipe the card</span>
        <button type="button" onClick={() => go(i + 1)} aria-label="Next role" className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#071630] active:scale-95">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>
        </button>
      </div>
    </section>
  );
}

/* ── trust: radar shield + live security check ── */

function Trust() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30% 0px -30% 0px" });
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!inView || done >= PILLARS.length) return;
    const t = setTimeout(() => setDone((d) => d + 1), done === 0 ? 500 : 900);
    return () => clearTimeout(t);
  }, [inView, done]);
  const all = done >= PILLARS.length;

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#050f22] px-5 py-14">
      <Glow className="-left-24 top-24 h-72 w-72 bg-sky-500/20" />
      <Glow className="-right-24 bottom-10 h-72 w-72 bg-emerald-400/15" />
      <div className="relative text-center">
        <Head dark kicker="Safe by design" title={<>Built for the trust <span className="lp-gradient-text">a school deserves.</span></>} />
      </div>

      {/* radar shield */}
      <div className="relative mx-auto mt-8 aspect-square w-[min(260px,70vw)]">
        {[0, 14, 28].map((inset) => <div key={inset} aria-hidden className="absolute rounded-full border border-sky-300/15" style={{ inset: `${inset}%` }} />)}
        <div aria-hidden className="lp-radar absolute inset-0 rounded-full" />
        <div className="lp-spin absolute inset-0 will-change-transform" style={{ "--spin": "26s" } as CSSProperties}>
          {PILLARS.map((p, k) => {
            const a = (k / PILLARS.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <span key={p.title} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${50 + 43 * Math.cos(a)}%`, top: `${50 + 43 * Math.sin(a)}%` }}>
                <span className="lp-spin grid h-10 w-10 place-items-center rounded-xl bg-[#0b1f3d] ring-1 transition-colors duration-500" style={{ "--spin": "26s", animationDirection: "reverse", color: k < done ? "#34d399" : "#7dd3fc", boxShadow: k < done ? "0 0 0 1px #34d39966, 0 0 24px -4px #34d399" : "0 0 0 1px rgba(125,211,252,0.25)" } as CSSProperties}>
                  <Icon name={p.icon} className="h-[18px] w-[18px]" />
                </span>
              </span>
            );
          })}
        </div>
        <div className="absolute left-1/2 top-1/2 grid h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 place-items-center">
          <span aria-hidden className="lp-ping absolute inset-0 rounded-[28%]" style={{ background: all ? "rgba(52,211,153,0.25)" : "rgba(56,189,248,0.2)" }} />
          <span className="relative grid h-full w-full place-items-center overflow-hidden rounded-[28%] bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-[0_20px_40px_-12px_rgba(14,165,233,0.6)]">
            <motion.span aria-hidden className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-600" initial={false} animate={{ opacity: all ? 1 : 0 }} transition={{ duration: 0.8, ease: "easeInOut" }} />
            <span className="relative"><Icon name={all ? "check" : "shield"} className="h-9 w-9" /></span>
          </span>
        </div>
      </div>

      {/* security check */}
      <div className="relative mt-8 overflow-hidden rounded-[26px] bg-white/[0.05] ring-1 ring-white/10">
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/55">Security check</p>
          <p className="font-mono text-[12px] font-bold" style={{ color: all ? "#34d399" : "#7dd3fc" }}>{done}/{PILLARS.length}</p>
        </div>
        <div className="mx-4 mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" animate={{ width: `${(done / PILLARS.length) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
        </div>
        <div className="mt-2 divide-y divide-white/[0.06]">
          {PILLARS.map((p, k) => {
            const ok = k < done;
            const running = k === done && inView && !all;
            return (
              <div key={p.title} className={`flex gap-3 px-4 py-3.5 transition-opacity duration-500 ${ok || running ? "opacity-100" : "opacity-40"}`}>
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center">
                  {ok ? (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }} className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400 text-[#050f22]"><Icon name="check" className="h-3.5 w-3.5" /></motion.span>
                  ) : running ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                  ) : (
                    <span className="h-5 w-5 rounded-full border-2 border-white/20" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-white">{p.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-white/55">{p.body}</p>
                </div>
              </div>
            );
          })}
        </div>
        <AnimatePresence>
          {all && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.45, ease: EASE }}>
              <div className="flex items-center gap-2 bg-emerald-400/10 px-4 py-3 text-[13px] font-semibold text-emerald-300">
                <Icon name="shield" className="h-4 w-4" />All checks passed · every action is logged
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── FAQ: a support chat ── */

function Typing() {
  return (
    <span className="flex gap-1 px-1 py-1">
      {[0, 1, 2].map((k) => <motion.span key={k} className="h-2 w-2 rounded-full bg-ink-3" animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.8, repeat: Infinity, delay: k * 0.15 }} />)}
    </span>
  );
}

function Faq() {
  const [thread, setThread] = useState<{ q: number; done: boolean }[]>([{ q: 0, done: true }]);
  const asked = new Set(thread.map((t) => t.q));
  const busy = thread.some((t) => !t.done);
  const ask = (q: number) => {
    if (asked.has(q) || busy) return;
    setThread((t) => [...t, { q, done: false }]);
    setTimeout(() => setThread((t) => t.map((x) => (x.q === q ? { ...x, done: true } : x))), 1200);
  };
  const left = FAQ.map((_, k) => k).filter((k) => !asked.has(k));

  return (
    <section className="relative bg-[#f4f7fc] px-5 py-14">
      <Head kicker="Questions" title={<>Good questions, <span className="lp-gradient-text-dark">clear answers.</span></>} sub="Tap a question and we'll answer it." />
      <FadeUp className="mt-7">
        <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_30px_60px_-34px_rgba(20,43,74,0.5)] ring-1 ring-line">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="relative grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-accent-500 to-indigo-600 text-white">
              <Icon name="help" className="h-5 w-5" />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" />
            </span>
            <div><p className="text-[14.5px] font-bold text-ink">Genesis Lumia</p><p className="text-[11.5px] font-medium text-emerald-600">Online · replies instantly</p></div>
          </div>
          <div className="space-y-3 px-3.5 py-4">
            <AnimatePresence initial={false}>
              {thread.map(({ q, done }) => (
                <motion.div key={q} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="space-y-2">
                  <div className="flex justify-end">
                    <p className="max-w-[82%] rounded-[20px] rounded-br-md bg-accent-600 px-3.5 py-2.5 text-[14px] font-medium leading-snug text-white">{FAQ[q].q}</p>
                  </div>
                  <div className="flex justify-start">
                    <motion.div layout className="max-w-[88%] rounded-[20px] rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
                      {done ? <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>{FAQ[q].a}</motion.span> : <Typing />}
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="border-t border-line bg-surface-2/50 px-3.5 py-3">
            {left.length ? (
              <>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">Ask about</p>
                <div className="flex flex-wrap gap-2">
                  {left.map((k) => (
                    <motion.button key={k} layout type="button" disabled={busy} onClick={() => ask(k)} className="rounded-full bg-white px-3.5 py-2 text-left text-[13px] font-semibold text-accent-700 ring-1 ring-accent-500/25 transition-opacity active:scale-[0.97] disabled:opacity-50">
                      {FAQ[k].q}
                    </motion.button>
                  ))}
                </div>
              </>
            ) : (
              <Link href="/login" className="flex items-center justify-center gap-1.5 rounded-2xl bg-ink py-3 text-[14px] font-semibold text-white">That&apos;s everything. Sign in <Icon name="arrowUpRight" className="h-4 w-4" /></Link>
            )}
          </div>
        </div>
      </FadeUp>
    </section>
  );
}

function FlowStep({ s, k, active, onActive }: { s: (typeof STAGES)[number]; k: number; active: boolean; onActive: (k: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const centred = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => { if (centred) onActive(k); }, [centred, k, onActive]);
  return (
    <div ref={ref} className="relative flex gap-4">
      <span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[12px] font-bold transition-all duration-500 ${active ? "bg-ink text-white" : "bg-white text-ink-3 ring-1 ring-line"}`}>
        {String(k + 1).padStart(2, "0")}
      </span>
      <div className={`min-w-0 flex-1 rounded-[22px] p-4 transition-all duration-500 ${active ? "bg-white shadow-[0_20px_44px_-26px_rgba(15,23,42,0.45)] ring-1 ring-line" : "ring-1 ring-transparent"}`}>
        <div className="flex items-center gap-2">
          <span className={`transition-colors duration-500 ${active ? "text-accent-600" : "text-ink-3"}`}><Icon name={s.icon} className="h-4 w-4" /></span>
          <p className={`text-[11.5px] font-semibold uppercase tracking-[0.14em] transition-colors duration-500 ${active ? "text-accent-600" : "text-ink-3"}`}>{s.tag}</p>
        </div>
        <p className={`mt-1.5 text-[18px] font-bold tracking-tight transition-colors duration-500 ${active ? "text-ink" : "text-ink-2"}`}>{s.title}</p>
        <p className={`mt-1 text-[14px] leading-relaxed transition-colors duration-500 ${active ? "text-ink-2" : "text-ink-3"}`}>{s.body}</p>
        <AnimatePresence initial={false}>
          {active && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {s.makes.map((m) => <span key={m} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-2">{m}</span>)}
              </div>
              <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10h11M11 5.5 15.5 10 11 14.5" /></svg>
                {s.via}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Flow() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 60%", "end 55%"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 24, restDelta: 0.001 });
  const dot = useTransform(smooth, (v) => `${v * 100}%`);
  const [active, setActive] = useState(0);

  return (
    <section className="relative bg-[#f8fafc] px-5 py-14">
      <Head kicker="How it flows" title={<>From admission to report card, <span className="text-accent-600">one story.</span></>} sub="Follow one student through the school year." />
      <div ref={ref} className="relative mt-9">
        <div aria-hidden className="absolute bottom-5 left-[17px] top-5 w-px bg-line" />
        <motion.div aria-hidden className="absolute left-[17px] top-5 w-px origin-top bg-accent-500" style={{ scaleY: smooth, height: "calc(100% - 40px)" }} />
        <motion.span aria-hidden className="absolute left-[17px] z-20 -ml-[5px] -mt-[5px] h-[11px] w-[11px] rounded-full bg-accent-500 ring-4 ring-accent-500/15" style={{ top: dot }} />
        <div className="space-y-3">
          {STAGES.map((s, k) => <FlowStep key={s.title} s={s} k={k} active={k === active} onActive={setActive} />)}
        </div>
      </div>
      <p className="mt-6 pl-[52px] text-[13px] text-ink-3">Then the cycle begins again, every year.</p>
    </section>
  );
}

/* ── page ── */

export function MobileLanding({ roles }: { roles: readonly Role[] }) {
  const [solid, setSolid] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 30));

  return (
    <div className="min-h-dvh bg-white">
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${solid ? "bg-white/85 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur-xl" : ""}`}>
        <div className="flex h-14 items-center justify-between px-5">
          <span className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white shadow-sm"><Image src="/logo.png" alt="" width={22} height={22} className="h-6 w-6 object-contain" /></span>
            <span className={`font-display text-[16px] font-bold tracking-tight transition-colors ${solid ? "text-ink" : "text-white"}`}>Genesis Lumia</span>
          </span>
          <Link href="/login" className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-colors ${solid ? "bg-ink text-white" : "bg-white/15 text-white ring-1 ring-white/25"}`}>Sign in</Link>
        </div>
      </header>

      {/* hero (dark) */}
      <section className="relative overflow-hidden bg-[#071630] px-5 pb-12 pt-28">
        <div aria-hidden className="pointer-events-none absolute inset-0"><div className="lp-aurora lp-a1" /><div className="lp-aurora lp-a3 opacity-70" /><div className="lp-grid absolute inset-0" /></div>
        <div className="relative">
          <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-sky-200 ring-1 ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />The school operating system
          </motion.span>
          <h1 className="mt-5 font-display text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] text-white">
            {["Run", "your", "whole", "school"].map((w, k) => (
              <motion.span key={w} className="mr-[0.22em] inline-block" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + k * 0.08, duration: 0.9, ease: EASE }}>{w}</motion.span>
            ))}
            <motion.span className="lp-gradient-text inline-block" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 1, ease: EASE }}>from your pocket.</motion.span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.7, ease: EASE }} className="mt-4 text-[15.5px] leading-relaxed text-white/70">
            Admissions, attendance, timetable, exams, fees, hostel, the gate desk and payroll, connected for leadership, teachers, wardens, parents and students.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.7, ease: EASE }} className="mt-7 grid grid-cols-2 gap-2.5">
            <Link href="/login" className="lp-shine relative flex h-12 items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-gradient-to-r from-accent-500 to-sky-400 text-[15px] font-bold text-white shadow-[0_12px_30px_-10px_rgba(59,130,246,0.8)] transition-transform active:scale-[0.97]">Get started <Icon name="arrowUpRight" className="h-4 w-4" /></Link>
            <a href="#m-show" className="flex h-12 items-center justify-center rounded-2xl bg-white/10 text-[15px] font-semibold text-white ring-1 ring-white/20 transition-transform active:scale-[0.97]">See the app</a>
          </motion.div>
          <div className="mt-9 grid grid-cols-2 gap-2.5">
            {STATS.map(([n, l], k) => (
              <motion.div key={l} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + k * 0.08, duration: 0.6, ease: EASE }} className="rounded-[20px] bg-white/[0.06] p-4 ring-1 ring-white/10">
                <p className="font-display text-[28px] font-extrabold leading-none tracking-tight text-white">{n}</p>
                <p className="mt-1.5 text-[12.5px] font-medium text-white/60">{l}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div id="m-show" className="scroll-mt-14"><Showcase /></div>
      <Modules />
      <Roles roles={roles} />
      <Flow />
      <Trust />
      <Faq />

      {/* closing (dark) */}
      <section className="relative overflow-hidden bg-[#071630] px-5 pb-14 pt-14 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0"><div className="lp-aurora lp-a1 opacity-70" /><div className="lp-grid absolute inset-0 opacity-40" /></div>
        <FadeUp className="relative">
          <h2 className="mx-auto max-w-xs font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">Give your school <span className="lp-gradient-text">the calm it deserves.</span></h2>
          <p className="mx-auto mt-3 max-w-xs text-[14.5px] text-white/65">Every module, every role and every report, on your desk or in your pocket.</p>
          <Link href="/login" className="mt-7 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-white text-[15px] font-bold text-brand-700 transition-transform active:scale-[0.97]">Sign in <Icon name="arrowUpRight" className="h-4 w-4" /></Link>
          <p className="mt-8 text-[12px] text-white/40">© {new Date().getFullYear()} Genesis Lumia</p>
        </FadeUp>
      </section>
    </div>
  );
}
