"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, ROLE_LABEL } from "@/lib/auth";

/** Seeded demo accounts (backend prisma/seed.ts DEMO_LOGINS), grouped the way a school is. */
const DEMO_GROUPS: { group: string; dot: string; logins: { role: string; email: string; password: string }[] }[] = [
  {
    group: "Leadership",
    dot: "bg-brand-700",
    logins: [
      { role: "super_admin", email: "admin@sainik01.edu", password: "Admin@123" },
      { role: "branch_admin", email: "schooladmin@sainik01.edu", password: "Demo@Admin1" },
      { role: "principal", email: "principal@sainik01.edu", password: "Demo@Principal1" },
      { role: "vice_principal", email: "vp@sainik01.edu", password: "Demo@Vp1" },
    ],
  },
  {
    group: "Office",
    dot: "bg-accent-600",
    logins: [
      { role: "office_superintendent", email: "os@sainik01.edu", password: "Demo@Os1" },
      { role: "admission_officer", email: "ao@sainik01.edu", password: "Demo@Ao1" },
      { role: "accounts", email: "accounts@sainik01.edu", password: "Demo@Accounts1" },
      { role: "hr", email: "hr@sainik01.edu", password: "Demo@Hr1" },
    ],
  },
  {
    group: "Teaching",
    dot: "bg-ok",
    logins: [
      { role: "hod", email: "hod@sainik01.edu", password: "Demo@Hod1" },
      { role: "teacher", email: "teacher@sainik01.edu", password: "Demo@Teacher1" },
    ],
  },
  {
    group: "Welfare",
    dot: "bg-warn",
    logins: [
      { role: "warden", email: "warden@sainik01.edu", password: "Demo@Warden1" },
      { role: "security", email: "security@sainik01.edu", password: "Demo@Security1" },
      { role: "discipline_officer", email: "discipline@sainik01.edu", password: "Demo@Discipline1" },
    ],
  },
  {
    group: "Portal",
    dot: "bg-danger",
    logins: [
      { role: "parent", email: "parent@sainik01.edu", password: "Demo@Parent1" },
      { role: "student", email: "student@sainik01.edu", password: "Demo@Student1" },
    ],
  },
];

type LoginResponse = { token: string; role: string; branch_id: string; must_change_password?: boolean };

/**
 * Sign-in only. Accounts are created by the school (Settings → User management) or by
 * the admission workflow — there is deliberately no public sign-up and no password-less SSO.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).get("expired") === "1");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      localStorage.setItem("token", res.token);
      // Kept only for legacy readers; the UI decides access from GET /auth/me, not this.
      localStorage.setItem("role", res.role);
      localStorage.setItem("branch_id", res.branch_id);
      const portal = (R.PORTAL as readonly string[]).includes(res.role);
      window.location.href = res.must_change_password ? "/account/password" : portal ? "/portal" : "/";
    } catch (err) {
      // fetch() rejects with a TypeError when the API is unreachable ("Failed to fetch");
      // a proxy/gateway failure can hand back an HTML page as the message. Neither reads well.
      const raw = err instanceof Error ? err.message.trim() : "";
      setError(
        err instanceof TypeError
          ? "Can't reach the server. Check your connection and try again."
          : !raw || raw.startsWith("<")
            ? "Sign-in failed. Please try again in a moment."
            : raw,
      );
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between overflow-hidden bg-page">
      {/* ── 1. Animated World Grid & Dotted Vector Network Background ── */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 flex justify-between opacity-30">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-full w-px bg-gradient-to-b from-line/50 via-line/10 to-line/50" />
          ))}
        </div>

        <svg className="absolute inset-0 h-full w-full opacity-70" xmlns="http://www.w3.org/2000/svg">
          {/* Flowing motion dashed curves */}
          <path
            d="M -50 350 Q 250 200 480 320 T 880 260 T 1320 340 T 1800 240"
            fill="none"
            stroke="#93C5FD"
            strokeWidth="1.75"
            strokeDasharray="6 6"
            className="animate-dash-flow"
          />
          <path
            d="M -50 520 Q 380 360 740 440 T 1240 380 T 1750 460"
            fill="none"
            stroke="#B4CBE6"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            className="animate-dash-flow-reverse"
          />
          <path
            d="M 100 680 Q 500 520 860 600 T 1450 540"
            fill="none"
            stroke="#BAE6FD"
            strokeWidth="1.25"
            strokeDasharray="4 4"
            className="animate-dash-flow"
          />

          {/* Dotted Node Network with radar ripple and smooth pulsing */}
          {[
            { cx: 120, cy: 350 },
            { cx: 280, cy: 260 },
            { cx: 480, cy: 320 },
            { cx: 680, cy: 220 },
            { cx: 880, cy: 260 },
            { cx: 1100, cy: 340 },
            { cx: 1320, cy: 340 },
            { cx: 1550, cy: 280 },
            { cx: 220, cy: 470 },
            { cx: 440, cy: 540 },
            { cx: 740, cy: 440 },
            { cx: 1020, cy: 500 },
            { cx: 1240, cy: 380 },
            { cx: 1480, cy: 430 },
            { cx: 360, cy: 640 },
            { cx: 640, cy: 690 },
            { cx: 920, cy: 620 },
            { cx: 1200, cy: 650 },
          ].map((dot, i) => (
            <g key={i} className="transition-all duration-300">
              {/* Pulsing radar ripple ring */}
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r="3"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="1.25"
                className="animate-ripple"
                style={{ animationDelay: `${(i % 5) * 0.55}s` }}
              />
              {/* Semi-transparent glow core */}
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r="6"
                fill="#3B82F6"
                fillOpacity="0.12"
                className="animate-dot-pulse"
                style={{ animationDelay: `${(i % 4) * 0.7}s` }}
              />
              {/* Crisp concentric ring */}
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r="3.5"
                fill="none"
                stroke="#2563EB"
                strokeWidth="1.25"
              />
              {/* Solid center dot */}
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r="1.75"
                fill="#2563EB"
              />
            </g>
          ))}
        </svg>

        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-brand-400/10 blur-[120px]" />
      </div>

      {/* ── 2. Top Header ── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10 max-md:!px-4 max-md:!py-4 max-md:gap-3">
        <div className="flex items-center gap-3 max-md:min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white shadow-sm">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3L1 9L12 15L21 10.09V17H23V9M5 13.18V17.18L12 21L19 17.18V13.18L12 17L5 13.18Z" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-ink">GENESIS LUMIA ERP</span>
            <span className="block text-[10px] font-medium text-ink-3 uppercase tracking-wider max-md:text-[11px]">Sainik School Core</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-ok-line bg-white/90 px-3.5 py-1 text-xs font-semibold text-ok-ink shadow-soft backdrop-blur-md max-md:shrink-0 max-md:px-3 max-md:py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
          </span>
          <span className="max-md:hidden">Institutional Network Online</span>
          <span className="md:hidden">Online</span>
        </div>
      </header>

      {/* ── 3. Centered Authentication Card ── */}
      <main className="relative z-10 my-auto flex items-center justify-center px-4 py-8 max-md:pt-2 max-md:pb-6">
        <div className="w-full max-w-[440px] rounded-xl border border-line/90 bg-white/95 p-6 sm:p-9 max-md:!p-5 shadow-2xl shadow-line/50 backdrop-blur-xl transition-all">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink max-md:!text-[24px]">
              Welcome back
            </h1>
            <p className="mt-1.5 text-xs text-ink-2 font-medium">
              Staff, parents and students sign in here
            </p>
          </div>

          {expired && !error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-warn-line bg-warn-soft p-3 text-xs font-semibold text-warn-ink" role="status">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
              </svg>
              <span>Your session expired. Please sign in again.</span>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-danger-line bg-danger-soft p-3 text-xs font-semibold text-danger-ink" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-md:mt-5">
            <div>
              <label htmlFor="login-id" className="block text-xs font-semibold text-ink-2 mb-1">Email or login ID</label>
              <input
                id="login-id"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@school.edu or your login ID"
                className="w-full rounded-lg border border-line-strong bg-white px-4 py-2.5 text-sm text-ink placeholder-slate-400 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-accent-500/10 transition max-md:min-h-11"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-ink-2 mb-1">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-line-strong bg-white px-4 py-2.5 text-sm text-ink placeholder-slate-400 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-accent-500/10 transition pr-10 max-md:min-h-11 max-md:pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2 max-md:right-0.5 max-md:grid max-md:h-11 max-md:w-11 max-md:place-items-center"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-3">
                Forgot your password? The school office can reset it for you.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-3 text-sm font-semibold max-md:min-h-12 max-md:text-[15px] text-white shadow-sm hover:bg-brand-600 active:scale-[0.99] disabled:opacity-50 transition"
            >
              <span>{loading ? "Signing in…" : "Sign in"}</span>
              <span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span>
            </button>
          </form>

          {/* Demo quick-fill: every seeded role, grouped */}
          <div className="mt-6 border-t border-line pt-4 max-md:mt-7 max-md:border-dashed max-md:pt-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 text-center mb-2.5 max-md:mb-2 max-md:text-[11px] max-md:font-semibold">
              Demo logins — tap to fill
            </p>
            <div className="space-y-2.5 max-md:space-y-2">
              {DEMO_GROUPS.map((g) => (
                <div key={g.group}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-3 max-md:text-[11px]">{g.group}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.logins.map((d) => (
                      <button
                        key={d.email}
                        type="button"
                        onClick={() => { setEmail(d.email); setPassword(d.password); setError(""); }}
                        title={d.email}
                        className={`flex min-h-9 items-center gap-2 rounded-xl border p-2 text-left text-[11px] transition max-md:min-h-10 max-md:py-1.5 max-md:text-[12px] hover:border-brand-300 hover:bg-brand-50/30 ${
                          email === d.email ? "border-brand-300 bg-brand-50/50" : "border-line bg-surface-2/70"
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${g.dot}`} aria-hidden />
                        <span className="truncate font-semibold text-ink-2 max-md:font-medium">{ROLE_LABEL[d.role] ?? d.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── 4. Global Timezone Ticker Bar ── */}
      <footer className="relative z-10 border-t border-line/70 bg-white/70 backdrop-blur-md py-2.5 px-4 overflow-x-auto max-md:overflow-x-visible max-md:py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between min-w-[720px] max-w-5xl mx-auto text-[10px] font-semibold text-ink-2 max-md:grid max-md:min-w-0 max-md:grid-cols-5 max-md:gap-y-2.5 max-md:text-[11px]">
          {[
            { time: "8:26 AM", tz: "UTC-8" },
            { time: "11:26 AM", tz: "UTC-6" },
            { time: "12:26 PM", tz: "UTC-4" },
            { time: "2:26 PM", tz: "UTC-2" },
            { time: "4:26 PM", tz: "UTC+0" },
            { time: "6:26 PM", tz: "UTC+2" },
            { time: "8:26 PM", tz: "UTC+4" },
            { time: "10:26 PM", tz: "UTC+6" },
            { time: "12:26 AM", tz: "UTC+8" },
            { time: "3:26 AM", tz: "UTC+10" },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <span className="block text-ink">{item.time}</span>
              <span className="text-ink-3 text-[9px] max-md:text-[11px]">{item.tz}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}