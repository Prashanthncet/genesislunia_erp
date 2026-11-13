"use client";

import { useEffect, useState } from "react";
import { apiFetch, getBffCallLog, type BffLogEntry } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { isDevAccessUnlocked } from "./DevToolsGuard";
import { Badge, Button, Card, CardHead, Icon, Input, useToast } from "@/components/ui";

type SecurityArchResponse = {
  caller_role: string;
  via_bff: boolean;
  recommendations: {
    feature: string;
    recommendation: string;
    status: string;
    implementation: string;
  }[];
};

type EmployeesBffProbe = {
  source: string;
  via_bff: boolean;
  role_scope: string;
  count: number;
  employees: { id: string; name: string; role: string; department: string | null }[];
};

export function SecurityArchitecturePanel() {
  const { me } = useMe();
  const toast = useToast();
  const [arch, setArch] = useState<SecurityArchResponse | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [empProbe, setEmpProbe] = useState<EmployeesBffProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [bffLogs, setBffLogs] = useState<readonly BffLogEntry[]>([]);

  useEffect(() => {
    setUnlocked(isDevAccessUnlocked());
    const onAccessChange = () => setUnlocked(isDevAccessUnlocked());
    window.addEventListener("erp:dev-access-changed", onAccessChange);
    return () => window.removeEventListener("erp:dev-access-changed", onAccessChange);
  }, []);

  useEffect(() => {
    apiFetch<SecurityArchResponse>("/api/auth/security-architecture")
      .then((res) => {
        setArch(res);
        setBffLogs([...getBffCallLog()]);
      })
      .catch(() => {});
  }, []);

  async function verifyCodeInline(e: React.FormEvent) {
    e.preventDefault();
    if (!accessCode.trim()) {
      setVerifyError("Enter the access code");
      return;
    }
    setVerifying(true);
    setVerifyError("");
    try {
      const res = await apiFetch<{ verified: boolean; message: string }>("/api/auth/verify-access-code", {
        method: "POST",
        body: JSON.stringify({ access_code: accessCode.trim() }),
      });
      if (res.verified) {
        try {
          sessionStorage.setItem("dev_access_verified", "1");
        } catch { /* storage blocked */ }
        setUnlocked(true);
        setAccessCode("");
        setBffLogs([...getBffCallLog()]);
        window.dispatchEvent(new CustomEvent("erp:dev-access-changed"));
        toast.push("Server verified access code — Console unlocked", "success");
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Invalid access code");
    } finally {
      setVerifying(false);
    }
  }

  async function testEmployeesBffProxy() {
    setProbing(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch("/api/employees", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EmployeesBffProbe;
      setEmpProbe(data);
      setBffLogs([...getBffCallLog()]);
      toast.push(`Proxied /api/employees via Next.js BFF (${data.count} employees)`, "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "BFF probe failed", "error");
    } finally {
      setProbing(false);
    }
  }

  return (
    <Card delay={0.04}>
      <CardHead
        icon="shield"
        title="BFF Proxy & Security Architecture"
        subtitle="Next.js Route Handlers (BFF) → Server-to-Server → NestJS Guards & Console Access Code Gate"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={arch?.via_bff !== false ? "emerald" : "sky"}>
              {arch?.via_bff !== false ? "Next.js BFF Proxy Active" : "Direct API"}
            </Badge>
            <Badge tone={unlocked ? "emerald" : "amber"}>
              {unlocked ? "Console Unlocked (Access Code Verified)" : "Console Locked (Access Code Required)"}
            </Badge>
          </div>
        }
      />

      <div className="space-y-5">
        {/* Visual Pipeline Diagram */}
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface-2 p-4 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">1. Next.js Frontend</span>
              <Badge tone="sky">Same-Origin</Badge>
            </div>
            <p className="mt-1 font-semibold text-ink text-[14px]">React Components · Browser</p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              Calls same-origin <code className="font-mono text-ink">/api/_rpc</code> &amp; <code className="font-mono text-ink">/api/employees</code>. Individual backend REST URLs are hidden in the browser Network tab.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">2. Next.js Route Handlers (BFF)</span>
              <Badge tone="brand">Server Proxy</Badge>
            </div>
            <p className="mt-1 font-semibold text-ink text-[14px]">/api/employees · /api/_rpc</p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              Decodes BFF envelopes on the server, attaches <code className="font-mono text-ink">X-BFF-Secret</code> &amp; <code className="font-mono text-ink">HttpOnly</code> cookies, and communicates server-to-server.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">3. NestJS Backend</span>
              <Badge tone="emerald">Guarded</Badge>
            </div>
            <p className="mt-1 font-semibold text-ink text-[14px]">Controllers · Services · Guards · DB</p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              Enforces <code className="font-mono text-ink">AuthGuard</code>, <code className="font-mono text-ink">RolesGuard</code>, and <code className="font-mono text-ink">SensitiveDataInterceptor</code> before querying Prisma.
            </p>
          </div>
        </div>

        {/* Security Recommendations Table */}
        <div className="table-scroll rounded-xl border border-line">
          <table className="data-table w-full text-left text-[13px]">
            <thead className="table-head">
              <tr>
                <th className="px-3.5 py-2.5">Feature</th>
                <th className="px-3.5 py-2.5">Recommendation</th>
                <th className="px-3.5 py-2.5">Implementation Details</th>
                <th className="px-3.5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(arch?.recommendations ?? [
                {
                  feature: "Inspect detection",
                  recommendation: "Best-effort only",
                  implementation: "Global DevToolsGuard intercepts F12, Ctrl+Shift+I/J/C/K, Ctrl+U, right-click inspect & docked console, requiring server-verified access code",
                  status: "active",
                },
                {
                  feature: "Access code",
                  recommendation: "Server-side verification",
                  implementation: "POST /api/auth/verify-access-code (SHA-256 timingSafeEqual on server)",
                  status: "active",
                },
                {
                  feature: "API protection",
                  recommendation: "NestJS Guards",
                  implementation: "AuthGuard + RolesGuard + ThrottlerGuard across all controllers",
                  status: "active",
                },
                {
                  feature: "API endpoints",
                  recommendation: "Next.js proxy",
                  implementation: "Next.js Route Handlers BFF (/api/_rpc, /api/employees, /api/[...path])",
                  status: "active",
                },
                {
                  feature: "Sensitive data",
                  recommendation: "Never send to unauthorized clients",
                  implementation: "Global SensitiveDataInterceptor + role-scoped Prisma select projections",
                  status: "active",
                },
              ]).map((row) => (
                <tr key={row.feature}>
                  <td className="px-3.5 py-2.5 font-semibold text-ink">{row.feature}</td>
                  <td className="px-3.5 py-2.5 font-medium text-brand-700">{row.recommendation}</td>
                  <td className="px-3.5 py-2.5 text-ink-2">{row.implementation}</td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone="emerald">{row.status === "active" ? "Verified" : row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Server-Side Access Code Verification & /api/employees BFF Probe */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form onSubmit={verifyCodeInline} className="rounded-xl border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Server-Side Console Access Code Verification</h3>
                <p className="text-[12px] text-ink-3">
                  Verifies against <code className="font-mono">DEV_ACCESS_CODE</code> on the NestJS server via <code className="font-mono">POST /api/auth/verify-access-code</code>.
                </p>
              </div>
              <Badge tone={unlocked ? "emerald" : "amber"}>
                {unlocked ? "Unlocked" : "Locked"}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[180px]">
                <Input
                  type="password"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter access code (e.g. GENESIS-DEV-2026)"
                  aria-label="Server access code"
                />
              </div>
              <Button type="submit" disabled={verifying} size="sm">
                <Icon name="key" className="h-4 w-4" />
                {verifying ? "Verifying…" : "Verify Code"}
              </Button>
            </div>
            {verifyError && (
              <p role="alert" className="text-[12.5px] font-medium text-danger">
                {verifyError}
              </p>
            )}
          </form>

          <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Next.js Route Handler Proxy (/api/employees)</h3>
                <p className="text-[12px] text-ink-3">
                  Tests same-origin BFF Route Handler <code className="font-mono">/api/employees</code> → NestJS <code className="font-mono">EmployeesController</code> ({me?.role}).
                </p>
              </div>
              <Button type="button" variant="soft" size="sm" onClick={testEmployeesBffProxy} disabled={probing}>
                <Icon name="spark" className="h-4 w-4" />
                {probing ? "Calling BFF…" : "Test /api/employees Proxy"}
              </Button>
            </div>

            {empProbe ? (
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="emerald">via_bff: {String(empProbe.via_bff)}</Badge>
                  <Badge tone="brand">scope: {empProbe.role_scope}</Badge>
                  <span className="font-medium text-ink">{empProbe.count} employee records returned</span>
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-3">
                Click &ldquo;Test /api/employees Proxy&rdquo; to verify server-to-server BFF communication and role-scoped redaction.
              </p>
            )}
          </div>
        </div>

        {/* BFF Tunnel Call Log (visible only after verifying the Server Access Code) */}
        {unlocked && bffLogs.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-2 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">
                BFF Inspector (Unlocked) — Recent Opaque Tunnel Calls ({bffLogs.length})
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setBffLogs([...getBffCallLog()])}>
                Refresh Log
              </Button>
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-line text-[12px] font-mono">
              {bffLogs.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-ink">
                    <strong className="text-brand-700">POST {entry.bffRoute}</strong>
                    {" → "}
                    <span className="text-ink-2">[{entry.method}] {entry.targetPath}</span>
                  </span>
                  <span className="text-ink-3">
                    HTTP {entry.status} · {entry.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
