"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

const DEMO = [
  { label: "Teacher", role: "teacher", email: "teacher@sainik01.edu", password: "Demo@Teacher1", color: "bg-purple-600" },
  { label: "Administrator", role: "super_admin", email: "admin@sainik01.edu", password: "Admin@123", color: "bg-blue-600" },
  { label: "Principal", role: "branch_admin", email: "principal@sainik01.edu", password: "Demo@Principal1", color: "bg-emerald-600" },
  { label: "Warden", role: "warden", email: "warden@sainik01.edu", password: "Demo@Warden1", color: "bg-amber-600" },
];

export default function LoginPage() {
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "sso">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (authMode === "sso") {
        const ssoEmail = email || "admin@sainik01.edu";
        const res = await apiFetch<{ token: string; role: string; branch_id: string }>(
          "/api/auth/sso",
          { method: "POST", body: JSON.stringify({ email: ssoEmail }) },
        );
        localStorage.setItem("token", res.token);
        localStorage.setItem("role", res.role);
        localStorage.setItem("branch_id", res.branch_id);
        window.location.href = "/";
        return;
      }

      if (authMode === "signup") {
        const signUpEmail = email || "teacher@sainik01.edu";
        const signUpPassword = password || "Demo@Teacher1";
        const res = await apiFetch<{ token: string; role: string; branch_id: string }>(
          "/api/auth/signup",
          { method: "POST", body: JSON.stringify({ email: signUpEmail, password: signUpPassword, role: "teacher" }) },
        );
        localStorage.setItem("token", res.token);
        localStorage.setItem("role", res.role);
        localStorage.setItem("branch_id", res.branch_id);
        window.location.href = "/";
        return;
      }

      const res = await apiFetch<{ token: string; role: string; branch_id: string }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      localStorage.setItem("token", res.token);
      localStorage.setItem("role", res.role);
      localStorage.setItem("branch_id", res.branch_id);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between overflow-hidden bg-[#FAFBFC]">
      {/* ── 1. Animated World Grid & Dotted Vector Network Background ── */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 flex justify-between opacity-30">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-full w-px bg-gradient-to-b from-slate-200/50 via-slate-200/10 to-slate-200/50" />
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
            stroke="#A5B4FC"
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

        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-blue-400/10 blur-[120px]" />
      </div>

      {/* ── 2. Top Header ── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0E2442] text-white shadow-sm">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3L1 9L12 15L21 10.09V17H23V9M5 13.18V17.18L12 21L19 17.18V13.18L12 17L5 13.18Z" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-slate-900">GENESIS LUMIA ERP</span>
            <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider">Sainik School Core</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white/90 px-3.5 py-1 text-xs font-semibold text-emerald-700 shadow-xs backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span>Institutional Network Online</span>
        </div>
      </header>

      {/* ── 3. Centered Lightswind Authentication Card ── */}
      <main className="relative z-10 my-auto flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] rounded-3xl border border-slate-200/90 bg-white/95 p-7 sm:p-9 shadow-2xl shadow-slate-200/50 backdrop-blur-xl transition-all">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="mt-1.5 text-xs text-slate-500 font-medium">
              Sign in to your distributed cloud workspace
            </p>
          </div>

          {/* Tab Selector: Sign In / Sign Up / SSO */}
          <div className="mt-6 flex rounded-2xl bg-slate-100/90 p-1 text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => setAuthMode("signin")}
              className={`flex-1 rounded-xl py-2 transition-all duration-150 ${
                authMode === "signin" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              className={`flex-1 rounded-xl py-2 transition-all duration-150 ${
                authMode === "signup" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("sso")}
              className={`flex-1 rounded-xl py-2 transition-all duration-150 ${
                authMode === "sso" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              SSO
            </button>
          </div>

          {/* Social Auth Buttons (shown in Sign In & Sign Up modes) */}
          {authMode !== "sso" && (
            <>
              <div className="mt-5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => { setEmail("teacher@sainik01.edu"); setPassword("Demo@Teacher1"); }}
                  className="flex w-full items-center justify-between rounded-2xl bg-[#0F172A] px-4 py-3 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                    </svg>
                    <span>Sign in with Google</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DEFAULT</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setEmail("admin@sainik01.edu"); setPassword("Admin@123"); }}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-[0.99]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 23 23">
                    <path fill="#f35325" d="M1 1h10v10H1z"/>
                    <path fill="#81bc06" d="M12 1h10v10H12z"/>
                    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                    <path fill="#ffba08" d="M12 12h10v10H12z"/>
                  </svg>
                  <span>Sign in with Microsoft</span>
                </button>
              </div>

              <div className="relative my-5 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  OR
                </span>
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition"
                />
              </div>
            </div>

            {/* Password input only for signin and signup */}
            {authMode !== "sso" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Password</label>
                  <a href="#forgot" className="text-[11px] font-semibold text-blue-600 hover:underline">
                    Forgot?
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons with exact labels matching screenshots */}
            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0F172A] py-3 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 transition"
            >
              <span>
                {loading
                  ? "Authenticating..."
                  : authMode === "signup"
                  ? "Create Free Account"
                  : authMode === "sso"
                  ? "Continue with SSO"
                  : "Continue"}
              </span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
          </form>

          {/* Quick Demo Pill Chips */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center mb-2">
              Instant Demo Logins
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-left text-[11px] hover:border-blue-300 hover:bg-blue-50/30 transition"
                >
                  <span className={`h-2 w-2 rounded-full ${d.color}`} />
                  <span className="font-semibold text-slate-700 truncate">{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer links */}
          <div className="mt-6 flex justify-center gap-4 text-[11px] font-medium text-slate-500">
            <button
              type="button"
              onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              className="hover:text-slate-800"
            >
              {authMode === "signin" ? "Create account" : "Sign in instead"}
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => setAuthMode("sso")}
              className="hover:text-slate-800"
            >
              Sign in with SAML/OIDC
            </button>
          </div>
        </div>
      </main>

      {/* ── 4. Global Timezone Ticker Bar ── */}
      <footer className="relative z-10 border-t border-slate-200/70 bg-white/70 backdrop-blur-md py-2.5 px-4 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[720px] max-w-5xl mx-auto text-[10px] font-semibold text-slate-500">
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
              <span className="block text-slate-800">{item.time}</span>
              <span className="text-slate-400 text-[9px]">{item.tz}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}