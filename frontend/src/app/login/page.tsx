"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button, Icon } from "@/components/ui";
import { useRouteMeta } from "@/components/RouteMeta";

const DEMO = [
  { label: "Principal", email: "principal@sainik01.edu", password: "Demo@Principal1" },
  { label: "Teacher", email: "teacher@sainik01.edu", password: "Demo@Teacher1" },
  { label: "Warden", email: "warden@sainik01.edu", password: "Demo@Warden1" },
  { label: "Admin", email: "admin@sainik01.edu", password: "Admin@123" },
];

export default function LoginPage() {
  const router = useRouter();
  useRouteMeta("/login");
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
      const res = await apiFetch<{ token: string; role: string; branch_id: string }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      localStorage.setItem("token", res.token);
      localStorage.setItem("role", res.role);
      localStorage.setItem("branch_id", res.branch_id);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-brand-400/25 blur-3xl animate-[float_10s_ease-in-out_infinite]" />
        <div className="absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-accent-400/25 blur-3xl animate-[float_12s_ease-in-out_infinite_reverse]" />
      </div>

      {/* Brand panel */}
      <div className="relative hidden flex-1 lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#0d2040_0%,#173c74_45%,#1f4d92_100%)] bg-[length:200%_200%] animate-[gradient-pan_16s_ease_infinite]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.14),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(249,160,63,0.18),transparent_50%)]" />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3" style={{ animation: "fade-up 0.6s var(--ease-out-soft) both" }}>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-sm font-black backdrop-blur">GL</span>
            <div>
              <p className="font-bold tracking-wide">Genesis Lumia ERP</p>
              <p className="text-xs text-blue-200">Sainik School</p>
            </div>
          </div>

          <div className="max-w-lg" style={{ animation: "fade-up 0.7s var(--ease-out-soft) 120ms both" }}>
            <h2 className="text-5xl font-bold leading-[1.08]">
              One system for<br />
              <span className="bg-gradient-to-r from-accent-300 to-accent-500 bg-clip-text text-transparent">the whole school</span>
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-blue-100/90">
              Admissions, students, attendance, fees, timetable, hostel, payroll and exams —
              every module connected, so the office never has to ask "where is that record?".
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {["13 modules", "Role-based access", "Full audit trail", "Parent communication"].map((t, i) => (
                <span key={t} className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-blue-100 backdrop-blur"
                  style={{ animation: `scale-in 0.4s var(--ease-spring) ${200 + i * 70}ms both` }}>
                  {t}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-blue-200/70">© {new Date().getFullYear()} Genesis Lumia ERP</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm" style={{ animation: "fade-up 0.6s var(--ease-out-soft) 80ms both" }}>
          <div className="card p-7">
            <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-lg font-black text-white shadow-soft">
              GL
            </span>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your school dashboard.</p>

            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700"
                style={{ animation: "scale-in 0.3s var(--ease-spring) both" }}>
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="label">Email address</span>
                <input
                  id="email" type="email" required autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu"
                  className="field"
                />
              </label>

              <label className="block">
                <span className="label">Password</span>
                <div className="relative">
                  <input
                    id="password" type={showPw ? "text" : "password"} required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    className="field pr-11"
                  />
                  <button
                    type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:text-brand-600"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <Button type="submit" variant="primary" loading={loading} className="w-full !py-3">
                {loading ? "Signing in…" : <>Sign in <span aria-hidden>→</span></>}
              </Button>
            </form>
          </div>

          {/* Demo credentials */}
          <div className="card mt-4 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Demo logins</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {DEMO.map((d, i) => (
                <button
                  key={d.label}
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="btn-soft !justify-start !px-3 !py-2 text-left text-xs"
                  style={{ animation: `fade-up 0.45s var(--ease-out-soft) ${300 + i * 60}ms both` }}
                >
                  <span className="font-bold text-slate-700">{d.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
              Click a role to fill the form. All data is scoped to this branch only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}