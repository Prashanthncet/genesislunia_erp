"use client";

/**
 * /landing — marketing page for Genesis Lumia ERP (not linked from the app yet).
 * Everything visual is code: gradients, SVG and live mini-mockups built from the
 * product's real UI patterns. Motion respects the visitor's reduced-motion setting.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence, MotionConfig, animate, motion, useInView, useMotionValueEvent, useScroll, useSpring, useTransform,
} from "motion/react";
import { Icon } from "@/components/ui";
import { CTA_SHAPES, DARK_SHAPES, Footer, GeoField, HERO_SHAPES, LIGHT_SHAPES, Orbits } from "./shapes";
import { ConnectedSection, FaqSection, TrustSection } from "./sections";

/* ── Shared bits ─────────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, delay = 0, y = 28, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold tracking-wide ${dark ? "bg-white/10 text-sky-200 ring-1 ring-white/15" : "bg-accent-50 text-accent-700 ring-1 ring-accent-500/15"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dark ? "bg-sky-300" : "bg-accent-500"}`} />
      {children}
    </span>
  );
}

function SectionHead({ eyebrow, title, sub, dark = false, center = true }: { eyebrow: string; title: ReactNode; sub?: string; dark?: boolean; center?: boolean }) {
  return (
    <Reveal className={`max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      <Eyebrow dark={dark}>{eyebrow}</Eyebrow>
      <h2 className={`mt-5 text-balance font-display text-[32px] font-extrabold leading-[1.08] tracking-[-0.025em] sm:text-[44px] ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
      {sub && <p className={`mt-4 text-pretty text-[16px] leading-relaxed sm:text-[18px] ${dark ? "text-white/70" : "text-ink-2"}`}>{sub}</p>}
    </Reveal>
  );
}

function CountUp({ to, suffix = "", duration = 1.6 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration, ease: EASE, onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [inView, to, duration]);
  return <span ref={ref} className="tabular-nums">{v}{suffix}</span>;
}

/* ── Data (product facts only — no invented customers or numbers) ───────── */

const MODULES = [
  ["students", "Student records"], ["admissions", "Admissions"], ["attendance", "Attendance & OD"], ["timetable", "Timetable"],
  ["exams", "Exams & report cards"], ["cbt", "Online tests"], ["academics", "Lesson plans"], ["fees", "Fees & receipts"],
  ["hostel", "Hostel & roll call"], ["door", "Gate desk"], ["leaves", "Leaves"], ["discipline", "Safeguarding"],
  ["staff", "Staff & payroll"], ["reports", "Reports"], ["bell", "Notices"], ["shield", "Role-based access"],
] as const;

const ROLES = [
  { id: "principal", label: "Principal", icon: "building", head: "The whole school, at a glance.", points: ["Attention board: absences, overdue fees, pending approvals", "Approve gate passes and leave from your phone", "Fee collection and attendance trends by class", "Every action confirmed and audit-logged"] },
  { id: "teacher", label: "Teacher", icon: "academics", head: "Teach more. Type less.", points: ["Mark attendance for a class in under a minute", "Your day: periods, rooms and substitutions", "Lesson plans, assignments and marks entry", "Grade online tests from one queue"] },
  { id: "warden", label: "Warden", icon: "hostel", head: "Every boarder, accounted for.", points: ["Morning and night roll call with one save", "Issue and approve gate passes", "Rooms, beds and moves in a tap", "Visitor log with check-in and check-out"] },
  { id: "security", label: "Security", icon: "shield", head: "A gate desk that can't be fooled.", points: ["Scan the pass, verify the parent's code", "Check students out and back in", "Late returns flagged automatically", "Visitor passes in seconds"] },
  { id: "parent", label: "Parent", icon: "user", head: "Your child's school day, in your pocket.", points: ["Attendance calendar and absence alerts", "Pay fees online and download receipts", "Timetable, results and report cards", "Request leave and track gate passes"] },
  { id: "student", label: "Student", icon: "cbt", head: "Everything you need, nothing you don't.", points: ["Today's timetable and attendance", "Take online tests from any device", "Results and report cards", "Notices from your teachers"] },
] as const;

const FLOW = [
  { icon: "admissions", title: "Admission", body: "Parents apply online; documents, fee and roll number flow through each office in order." },
  { icon: "fees", title: "Fees", body: "Invoices go out, parents pay online, receipts arrive instantly — defaulters update themselves." },
  { icon: "attendance", title: "Daily school life", body: "Attendance, timetable, hostel roll call and the gate desk run the day — parents stay informed." },
  { icon: "exams", title: "Assessment", body: "Exams, online tests and marks become report cards with a single publish." },
  { icon: "reports", title: "Insight", body: "Leadership sees attendance, fees and results trends — and every action has an audit trail." },
];

/* ── Hero product mockup ─────────────────────────────────────────────────── */

function HeroMockup() {
  const bars = [62, 74, 58, 81, 77, 90, 86];
  return (
    <div className="relative mx-auto w-full max-w-[560px] [perspective:1600px] lg:max-w-[640px] lg:scale-[1.04]">
      <motion.div
        initial={{ opacity: 0, rotateX: 18, y: 40 }}
        animate={{ opacity: 1, rotateX: 8, y: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.35 }}
        className="relative rounded-[26px] border border-white/15 bg-white/[0.07] p-3 shadow-[0_40px_120px_-30px_rgba(59,130,246,0.55)] backdrop-blur-xl"
      >
        <div className="rounded-[20px] bg-[#f6f8fc] p-4">
          {/* window chrome */}
          <div className="mb-3 flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><span className="ml-3 h-5 flex-1 rounded-md bg-white" /></div>
          <div className="grid grid-cols-3 gap-2.5">
            {[["Present today", "94.3%", "text-emerald-600"], ["Fees collected", "₹38.2L", "text-accent-600"], ["Gate passes", "6 out", "text-amber-600"]].map(([k, v, c], n) => (
              <motion.div key={k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + n * 0.12, ease: EASE }} className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
                <p className="text-[10px] font-medium text-ink-3">{k}</p>
                <p className={`mt-0.5 font-display text-[18px] font-extrabold ${c}`}>{v}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-5 gap-2.5">
            <div className="col-span-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
              <p className="text-[10.5px] font-semibold text-ink-2">Attendance this week</p>
              <div className="mt-2 flex h-28 items-end gap-1.5 lg:h-36">
                {bars.map((h, k) => (
                  <motion.span key={k} className="flex-1 rounded-t-md bg-gradient-to-t from-brand-700 to-accent-500" initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 1 + k * 0.07, duration: 0.7, ease: EASE }} />
                ))}
              </div>
            </div>
            <div className="col-span-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
              <p className="text-[10.5px] font-semibold text-ink-2">Collection</p>
              <svg viewBox="0 0 120 70" className="mt-1 h-28 w-full lg:h-36">
                <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".35" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs>
                <motion.path d="M0 58 C 18 52, 26 40, 40 42 S 66 22, 80 26 S 104 10, 120 8" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.1, duration: 1.6, ease: EASE }} />
                <motion.path d="M0 58 C 18 52, 26 40, 40 42 S 66 22, 80 26 S 104 10, 120 8 V70 H0Z" fill="url(#lg)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1, duration: 0.8 }} />
              </svg>
            </div>
          </div>
        </div>
      </motion.div>

      {/* floating cards */}
      <motion.div className="absolute -left-4 top-[58%] hidden rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5 sm:block" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0, y: [0, -8, 0] }} transition={{ opacity: { delay: 1.6 }, x: { delay: 1.6 }, y: { delay: 2, duration: 5, repeat: Infinity, ease: "easeInOut" } }}>
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Icon name="check" className="h-5 w-5" /></span><div><p className="text-[12.5px] font-bold text-ink">Attendance saved</p><p className="text-[11px] text-ink-3">Class 10 A · 12 students</p></div></div>
      </motion.div>
      <motion.div className="absolute -right-3 top-[8%] hidden rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5 sm:block" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0, y: [0, 9, 0] }} transition={{ opacity: { delay: 1.9 }, x: { delay: 1.9 }, y: { delay: 2.3, duration: 6, repeat: Infinity, ease: "easeInOut" } }}>
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-600"><Icon name="door" className="h-5 w-5" /></span><div><p className="text-[12.5px] font-bold text-ink">Gate pass approved</p><p className="text-[11px] text-ink-3">Parent code sent · 2:30 PM</p></div></div>
      </motion.div>
      <motion.div className="absolute -bottom-5 right-8 hidden rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5 sm:block" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: [0, -6, 0] }} transition={{ opacity: { delay: 2.2 }, y: { delay: 2.6, duration: 5.5, repeat: Infinity, ease: "easeInOut" } }}>
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600"><Icon name="receipt" className="h-5 w-5" /></span><div><p className="text-[12.5px] font-bold text-ink">₹12,875 received</p><p className="text-[11px] text-ink-3">Receipt emailed to parent</p></div></div>
      </motion.div>
    </div>
  );
}

/* ── Phone showcase ──────────────────────────────────────────────────────── */

function Phone() {
  const [tab, setTab] = useState(0);
  useEffect(() => { const t = setInterval(() => setTab((x) => (x + 1) % 3), 3200); return () => clearInterval(t); }, []);
  const screens = [
    <div key="a" className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Today</p>
      {[["Mathematics", "9:00 · Room 12", "bg-accent-500"], ["Physics", "10:00 · Lab 2", "bg-violet-500"], ["Lunch", "13:00", "bg-amber-400"], ["English", "14:00 · Room 7", "bg-emerald-500"]].map(([s, t, c]) => (
        <div key={s} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5"><span className={`h-9 w-1.5 rounded-full ${c}`} /><div><p className="text-[13.5px] font-bold text-ink">{s}</p><p className="text-[11.5px] text-ink-3">{t}</p></div></div>
      ))}
    </div>,
    <div key="b" className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">October attendance</p>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 28 }, (_, d) => (
          <span key={d} className={`grid aspect-square place-items-center rounded-lg text-[10.5px] font-semibold ${d % 7 === 6 ? "text-ink-3" : d === 11 ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{d + 1}</span>
        ))}
      </div>
      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5"><p className="text-[11.5px] text-ink-3">This month</p><p className="font-display text-[22px] font-extrabold text-emerald-600">96%</p></div>
    </div>,
    <div key="c" className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Fees</p>
      <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-accent-600 p-4 text-white shadow-lg"><p className="text-[11.5px] text-white/70">Balance due</p><p className="font-display text-[26px] font-extrabold">₹12,875</p><p className="text-[11.5px] text-white/70">Due 10 Nov</p></div>
      <div className="grid h-11 place-items-center rounded-xl bg-brand-700 text-[13.5px] font-bold text-white">Pay ₹12,875</div>
      <div className="grid h-11 place-items-center rounded-xl bg-white text-[13px] font-semibold text-ink ring-1 ring-black/10">Download receipt</div>
    </div>,
  ];
  const navs = [["home", "Home"], ["attendance", "Attendance"], ["fees", "Fees"]];
  return (
    <div className="relative mx-auto h-[600px] w-[300px] rounded-[48px] border-[10px] border-[#0b1f3a] bg-[#0b1f3a] shadow-[0_50px_120px_-30px_rgba(11,31,58,0.6)]">
      <div className="absolute left-1/2 top-2 h-6 w-28 -translate-x-1/2 rounded-full bg-black" />
      <div className="flex h-full flex-col overflow-hidden rounded-[38px] bg-[#f4f6fb]">
        <div className="flex items-center justify-between px-5 pb-3 pt-10">
          <div><p className="text-[11px] text-ink-3">Good morning,</p><p className="text-[17px] font-bold text-ink">Devendra</p></div>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-700 text-[13px] font-bold text-white">D</span>
        </div>
        <div className="relative flex-1 overflow-hidden px-4">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.4, ease: EASE }}>
              {screens[tab]}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="grid grid-cols-3 border-t border-black/5 bg-white/90 px-2 pb-5 pt-2 backdrop-blur">
          {navs.map(([ic, l], k) => (
            <button key={l} type="button" onClick={() => setTab(k)} className="flex flex-col items-center gap-1">
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${tab === k ? "bg-accent-50 text-accent-600" : "text-ink-3"}`}><Icon name={ic} className="h-[18px] w-[18px]" /></span>
              <span className={`text-[10.5px] ${tab === k ? "font-bold text-accent-700" : "text-ink-3"}`}>{l}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [role, setRole] = useState<(typeof ROLES)[number]["id"]>("principal");
  const [scrolled, setScrolled] = useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const heroY = useTransform(scrollY, [0, 600], [0, 120]);

  const flowRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: flowP } = useScroll({ target: flowRef, offset: ["start 75%", "end 55%"] });
  const flowLine = useSpring(flowP, { stiffness: 90, damping: 25 });

  const current = ROLES.find((r) => r.id === role)!;

  return (
    <MotionConfig reducedMotion="user">
      <style>{CSS}</style>
      <div className="lp min-h-dvh overflow-x-clip bg-white text-ink antialiased">
        {/* scroll progress */}
        <motion.div className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-accent-500 via-sky-400 to-amber-400" style={{ scaleX: progress }} />

        {/* ── Nav ── */}
        <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/80 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur-xl" : "bg-transparent"}`}>
          <nav className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
            <a href="#top" className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5"><Image src="/logo.png" alt="" width={30} height={30} className="h-7 w-7 object-contain" /></span>
              <span className={`font-display text-[17px] font-extrabold tracking-tight transition-colors ${scrolled ? "text-ink" : "text-white"}`}>Genesis Lumia</span>
            </a>
            <div className={`hidden items-center gap-8 text-[14px] font-medium md:flex ${scrolled ? "text-ink-2" : "text-white/80"}`}>
              {[["Features", "#features"], ["Roles", "#roles"], ["How it works", "#flow"], ["Mobile", "#mobile"], ["FAQ", "#faq"]].map(([l, h]) => (
                <a key={h} href={h} className={`transition-colors ${scrolled ? "hover:text-ink" : "hover:text-white"}`}>{l}</a>
              ))}
            </div>
            <Link href="/login" className={`lp-shine relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full px-5 text-[14px] font-semibold transition-colors ${scrolled ? "bg-brand-700 text-white hover:bg-brand-900" : "bg-white text-brand-700 hover:bg-white/90"}`}>
              Sign in <Icon name="arrowUpRight" className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        {/* ── Hero ── */}
        <section id="top" className="relative overflow-hidden bg-[#071630] pb-28 pt-36 sm:pb-36 sm:pt-44">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="lp-aurora lp-a1" /><div className="lp-aurora lp-a2" /><div className="lp-aurora lp-a3" />
            <div className="lp-grid absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#071630]" />
          </div>
          <GeoField shapes={HERO_SHAPES} pointer />
          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
            <motion.div style={{ y: heroY }}>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
                <Eyebrow dark>The school operating system</Eyebrow>
              </motion.div>
              <h1 className="mt-6 font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:text-[64px] lg:text-[72px]">
                {["Run", "your", "whole", "school"].map((w, i) => (
                  <motion.span key={w} className="mr-[0.25em] inline-block" initial={{ opacity: 0, y: 30, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: 0.1 + i * 0.08, duration: 0.7, ease: EASE }}>{w}</motion.span>
                ))}
                <br className="hidden sm:block" />
                <motion.span className="lp-gradient-text inline-block" initial={{ opacity: 0, y: 30, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: 0.45, duration: 0.8, ease: EASE }}>from one calm place.</motion.span>
              </h1>
              <motion.p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/70 sm:text-[19px]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.7, ease: EASE }}>
                Admissions, attendance, timetable, exams, fees, hostel, the gate desk and payroll — beautifully connected for leadership, teachers, wardens, parents and students. On every screen, especially the one in your pocket.
              </motion.p>
              <motion.div className="mt-9 flex flex-wrap items-center gap-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.7, ease: EASE }}>
                <Link href="/login" className="lp-shine relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-accent-500 to-sky-400 px-7 text-[15px] font-bold text-white shadow-[0_12px_40px_-8px_rgba(59,130,246,0.7)] transition-transform hover:-translate-y-0.5">
                  Get started <Icon name="arrowUpRight" className="h-4 w-4" />
                </Link>
                <a href="#features" className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 text-[15px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/10">
                  Explore features
                </a>
              </motion.div>
              <motion.div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-white/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
                {[["shield", "Role-based access"], ["phone", "Mobile-first"], ["check", "Every change confirmed"]].map(([ic, t]) => (
                  <span key={t} className="inline-flex items-center gap-2"><Icon name={ic} className="h-4 w-4 text-sky-300" />{t}</span>
                ))}
              </motion.div>
            </motion.div>
            <div className="relative">
              <Orbits />
              <HeroMockup />
            </div>
          </div>
        </section>

        {/* ── Module marquee ── */}
        <section className="relative border-b border-line bg-white py-7">
          <div className="lp-marquee-mask flex overflow-hidden">
            {[0, 1].map((k) => (
              <div key={k} aria-hidden={k === 1} className="lp-marquee flex shrink-0 items-center gap-3 pr-3">
                {MODULES.map(([ic, l]) => (
                  <span key={l + k} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface-2/60 px-4 py-2 text-[13.5px] font-semibold text-ink-2">
                    <Icon name={ic} className="h-4 w-4 text-accent-600" />{l}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="relative overflow-hidden bg-white py-20">
          <GeoField shapes={LIGHT_SHAPES.slice(0, 4)} />
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-5 sm:px-8 lg:grid-cols-4">
            {[
              { n: 16, s: "", l: "Roles, each with exactly the screens it needs" },
              { n: 20, s: "+", l: "Connected modules, one source of truth" },
              { n: 6, s: "", l: "Portals — leadership to parents and students" },
              { n: 100, s: "%", l: "Mobile-ready, from roll call to fee payment" },
            ].map((x, k) => (
              <Reveal key={x.l} delay={k * 0.08}>
                <div className="group relative h-full overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-white to-surface-2/60 p-6 transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(20,43,74,0.25)]">
                  <span aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent-500/10 blur-2xl transition-transform duration-700 group-hover:scale-150" />
                  <p className="font-display text-[44px] font-extrabold leading-none tracking-tight text-brand-700 sm:text-[56px]"><CountUp to={x.n} suffix={x.s} /></p>
                  <p className="mt-3 text-[14px] leading-snug text-ink-2">{x.l}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Everything connected ── */}
        <ConnectedSection />

        {/* ── Roles ── */}
        <section id="roles" className="relative scroll-mt-20 overflow-hidden bg-[#071630] py-24 sm:py-32">
          <div aria-hidden className="pointer-events-none absolute inset-0"><div className="lp-aurora lp-a2 opacity-50" /><div className="lp-grid absolute inset-0 opacity-50" /></div>
          <GeoField shapes={DARK_SHAPES} />
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
            <SectionHead dark eyebrow="Built for every role" title="The right screen for every person." sub="Sixteen roles, one system. Pick a role to see the school through their eyes." />
            <div className="mx-auto mt-12 flex max-w-3xl flex-wrap justify-center gap-2">
              {ROLES.map((r) => (
                <button key={r.id} type="button" onClick={() => setRole(r.id)} className={`relative inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors ${role === r.id ? "text-brand-700" : "text-white/70 hover:text-white"}`}>
                  {role === r.id && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  <span className="relative inline-flex items-center gap-2"><Icon name={r.icon} className="h-4 w-4" />{r.label}</span>
                </button>
              ))}
            </div>
            <div className="mx-auto mt-10 max-w-5xl">
              <AnimatePresence mode="wait">
                <motion.div key={role} initial={{ opacity: 0, y: 20, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -14, filter: "blur(6px)" }} transition={{ duration: 0.45, ease: EASE }}
                  className="grid items-center gap-8 rounded-[32px] border border-white/10 bg-white/[0.05] p-7 backdrop-blur-xl sm:p-10 md:grid-cols-[1fr_1.1fr]">
                  <div>
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent-500 to-sky-400 text-white shadow-lg"><Icon name={current.icon} className="h-7 w-7" /></span>
                    <h3 className="mt-6 font-display text-[28px] font-extrabold leading-tight tracking-tight text-white sm:text-[34px]">{current.head}</h3>
                    <p className="mt-3 text-[15px] text-white/60">For the {current.label.toLowerCase()} — on desktop and phone.</p>
                  </div>
                  <ul className="space-y-3">
                    {current.points.map((p, k) => (
                      <motion.li key={p} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + k * 0.07, ease: EASE }} className="flex items-start gap-3 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/20 text-emerald-300"><Icon name="check" className="h-3.5 w-3.5" /></span>
                        <span className="text-[15px] leading-snug text-white/90">{p}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="flow" className="relative scroll-mt-20 overflow-hidden bg-white py-24 sm:py-32">
          <GeoField shapes={[
            { kind: "dashRing", color: "#3b82f6", size: 160, at: "-right-16 top-[30%]", spin: 60, bob: 14, opacity: 0.18 },
            { kind: "triangle", color: "#0d9488", size: 56, at: "left-[6%] top-[22%]", spin: 44, bob: 10, opacity: 0.22 },
            { kind: "square", color: "#6366f1", size: 44, at: "left-[10%] bottom-[16%]", spin: 30, bob: 11, opacity: 0.2 },
            { kind: "plus", color: "#f59e0b", size: 26, at: "right-[12%] bottom-[10%]", spin: 22, bob: 8, opacity: 0.45 },
          ]} />
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHead eyebrow="How it flows" title={<>From admission to report card, <span className="lp-gradient-text-dark">one continuous story.</span></>} />
            <div ref={flowRef} className="relative mx-auto mt-16 max-w-3xl">
              <div aria-hidden className="absolute bottom-0 left-[27px] top-0 w-[3px] rounded-full bg-line sm:left-1/2 sm:-translate-x-1/2" />
              <motion.div aria-hidden className="absolute left-[27px] top-0 w-[3px] origin-top rounded-full bg-gradient-to-b from-accent-500 via-sky-400 to-emerald-400 sm:left-1/2 sm:-translate-x-1/2" style={{ scaleY: flowLine, height: "100%" }} />
              <div className="space-y-10">
                {FLOW.map((s, k) => (
                  <Reveal key={s.title} y={20}>
                    <div className={`relative flex items-start gap-5 sm:w-1/2 ${k % 2 ? "sm:ml-auto sm:pl-12" : "sm:flex-row-reverse sm:pr-12 sm:text-right"}`}>
                      <span className={`relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-accent-600 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.5)] ring-1 ring-accent-500/20 sm:absolute sm:top-0 ${k % 2 ? "sm:-left-7" : "sm:-right-7"}`}>
                        <Icon name={s.icon} className="h-6 w-6" />
                      </span>
                      <div className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
                        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-600">Step {k + 1}</p>
                        <h3 className="mt-1.5 font-display text-[20px] font-bold text-ink">{s.title}</h3>
                        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{s.body}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Mobile ── */}
        <section id="mobile" className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-[#eef4ff] to-white py-24 sm:py-32">
          <div aria-hidden className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/20 blur-[120px]" />
          <GeoField shapes={[
            { kind: "hex", color: "#3b82f6", size: 90, at: "right-[4%] top-[10%]", spin: 50, bob: 13, opacity: 0.2 },
            { kind: "ring", color: "#0d9488", size: 60, at: "left-[48%] bottom-[8%]", bob: 11, opacity: 0.25, hideMobile: true },
            { kind: "dots", color: "#1e3a8a", size: 80, at: "left-[3%] bottom-[12%]", bob: 15, opacity: 0.14 },
            { kind: "diamond", color: "#f59e0b", size: 34, at: "right-[40%] top-[12%]", spin: 20, bob: 9, opacity: 0.5, hideMobile: true },
          ]} />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
            <div>
              <SectionHead center={false} eyebrow="Phone-first" title={<>The whole school, <span className="lp-gradient-text-dark">in your pocket.</span></>} sub="Not a squeezed desktop — a real mobile app experience: bottom navigation, full-screen forms, swipe-friendly cards and touch targets made for thumbs." />
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[["grid", "Cards built for phones"], ["filter", "Filters in a bottom sheet"], ["check", "Confirm before every change"], ["download", "Beautiful PDF downloads"]].map(([ic, t], k) => (
                  <Reveal key={t} delay={k * 0.06}>
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/80 p-4 backdrop-blur"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-50 text-accent-600"><Icon name={ic} className="h-5 w-5" /></span><span className="text-[14.5px] font-semibold text-ink">{t}</span></div>
                  </Reveal>
                ))}
              </div>
            </div>
            <Reveal delay={0.1}><div className="lp-float"><Phone /></div></Reveal>
          </div>
        </section>

        {/* ── Safe by design ── */}
        <TrustSection />

        {/* ── FAQ ── */}
        <FaqSection />

        {/* ── Final CTA ── */}
        <section className="relative bg-white px-5 py-20 sm:px-8 sm:py-28">
          <Reveal>
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[40px] bg-[#071630] px-6 py-16 text-center sm:px-16 sm:py-24">
              <div aria-hidden className="pointer-events-none absolute inset-0"><div className="lp-aurora lp-a1 opacity-80" /><div className="lp-aurora lp-a3 opacity-70" /><div className="lp-grid absolute inset-0 opacity-40" /></div>
              <GeoField shapes={CTA_SHAPES} pointer />
              <div className="relative">
                <h2 className="mx-auto max-w-3xl text-balance font-display text-[34px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white sm:text-[54px]">
                  Give your school <span className="lp-gradient-text">the calm it deserves.</span>
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[16px] text-white/70 sm:text-[18px]">Sign in and see every module, every role and every report — on your desk or in your pocket.</p>
                <div className="mt-9 flex flex-wrap justify-center gap-3">
                  <Link href="/login" className="lp-shine relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-white px-8 text-[15px] font-bold text-brand-700 shadow-[0_12px_40px_-8px_rgba(255,255,255,0.4)] transition-transform hover:-translate-y-0.5">
                    Sign in <Icon name="arrowUpRight" className="h-4 w-4" />
                  </Link>
                  <a href="#features" className="inline-flex h-12 items-center rounded-full border border-white/25 px-8 text-[15px] font-semibold text-white transition-colors hover:bg-white/10">See features</a>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Footer ── */}
        <Footer />
      </div>
    </MotionConfig>
  );
}

/* ── Page-scoped CSS: aurora, grid, marquee, shine, gradient text ───────── */

const CSS = `
.lp { scroll-behavior: smooth; }
.lp-aurora { position:absolute; border-radius:9999px; filter: blur(90px); opacity:.55; will-change: transform; }
.lp-a1 { width:620px; height:620px; left:-140px; top:-180px; background: radial-gradient(circle at 30% 30%, #3b82f6, transparent 65%); animation: lp-drift1 18s ease-in-out infinite; }
.lp-a2 { width:560px; height:560px; right:-160px; top:60px; background: radial-gradient(circle at 60% 40%, #14b8a6, transparent 65%); animation: lp-drift2 22s ease-in-out infinite; }
.lp-a3 { width:520px; height:520px; left:30%; bottom:-260px; background: radial-gradient(circle at 50% 50%, #f59e0b, transparent 62%); opacity:.35; animation: lp-drift3 26s ease-in-out infinite; }
@keyframes lp-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(120px,60px) scale(1.12); } }
@keyframes lp-drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-100px,80px) scale(.92); } }
@keyframes lp-drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-80px,-60px) scale(1.15); } }
.lp-grid { background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px); background-size: 56px 56px; mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 75%); }
.lp-dots { background-image: radial-gradient(rgba(20,43,74,.12) 1px, transparent 1px); background-size: 22px 22px; mask-image: linear-gradient(to bottom, transparent, #000 15%, #000 85%, transparent); }
.lp-gradient-text { background: linear-gradient(100deg, #93c5fd 0%, #5eead4 35%, #fcd34d 70%, #93c5fd 100%); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: lp-pan 7s linear infinite; }
.lp-gradient-text-dark { background: linear-gradient(100deg, #2563eb 0%, #0d9488 50%, #2563eb 100%); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: lp-pan 8s linear infinite; }
@keyframes lp-pan { to { background-position: 200% center; } }
.lp-marquee { animation: lp-marquee 38s linear infinite; }
.lp-marquee-mask:hover .lp-marquee { animation-play-state: paused; }
.lp-marquee-mask { mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
@keyframes lp-marquee { to { transform: translateX(-100%); } }
.lp-shine::after { content:""; position:absolute; inset:0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.45) 50%, transparent 70%); transform: translateX(-120%); transition: transform .8s cubic-bezier(.22,1,.36,1); }
.lp-shine:hover::after { transform: translateX(120%); }
.lp-float { animation: lp-float 7s ease-in-out infinite; }
@keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
.lp-spin { animation: lp-spin var(--spin) linear infinite; }
.lp-pulse { stroke-dashoffset: 0; animation: lp-pulse 2.8s linear infinite; }
@keyframes lp-pulse { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -406; } }
.lp-ping { animation: lp-ping 2.4s cubic-bezier(0,0,.2,1) infinite; }
@keyframes lp-ping { 0% { transform: scale(1); opacity: .9; } 80%,100% { transform: scale(1.6); opacity: 0; } }
.lp-radar { background: conic-gradient(from 0deg, rgba(56,189,248,.28), rgba(56,189,248,0) 70deg, transparent 360deg); animation: lp-spin 6s linear infinite; mask-image: radial-gradient(circle, #000 0 70%, transparent 71%); }
.lp-bob { animation: lp-bob var(--bob) ease-in-out infinite; }
@keyframes lp-spin { to { transform: rotate(360deg); } }
@keyframes lp-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
.lp-orbit { animation: lp-spin var(--orbit) linear infinite; }
.lp-wordmark { font-size: clamp(88px, 22vw, 300px); background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0) 85%); -webkit-background-clip: text; background-clip: text; color: transparent; margin-bottom: -0.12em; }
.lp-flink { background: linear-gradient(currentColor, currentColor) 0 100% / 0 1px no-repeat; transition: background-size .35s cubic-bezier(.22,1,.36,1), color .2s; padding-bottom: 2px; }
.lp-flink:hover { background-size: 100% 1px; }
@media (prefers-reduced-motion: reduce) {
  .lp-aurora, .lp-gradient-text, .lp-gradient-text-dark, .lp-marquee, .lp-float, .lp-spin, .lp-bob, .lp-orbit, .lp-pulse, .lp-ping, .lp-radar { animation: none !important; }
  .lp { scroll-behavior: auto; }
}
`;
