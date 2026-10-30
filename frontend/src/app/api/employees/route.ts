import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getBffSharedSecret, proxyToNestBackend, sanitizeBffJson } from "@/lib/bff-proxy";

/**
 * Dedicated Next.js Route Handler (BFF) for `/api/employees`.
 *
 * Architecture:
 *   Browser (React components)
 *     -> Same-origin request (`/api/employees`)
 *     -> Next.js Route Handler BFF (`src/app/api/employees/route.ts`)
 *     -> Server-to-server communication (`BACKEND_URL/api/employees` or `/api/staff` with `X-BFF-Secret`)
 *     -> NestJS Backend (`AuthGuard` + `RolesGuard` + `SensitiveDataInterceptor`)
 */
export async function GET(req: NextRequest) {
  const search = req.nextUrl.search || "";
  const primaryRes = await proxyToNestBackend(req, {
    targetPath: `/api/employees${search}`,
    method: "GET",
  });

  // If the upstream NestJS instance has `/api/employees` compiled, return it directly
  if (primaryRes.status !== 404) {
    return primaryRes;
  }

  // Fallback server-to-server proxy to `/api/staff` if the running NestJS dist precedes EmployeesController
  const backendBase = getBackendBaseUrl();
  const incomingAuth = req.headers.get("authorization") ?? (req.cookies.get("erp_token")?.value ? `Bearer ${req.cookies.get("erp_token")?.value}` : "");
  const headers: Record<string, string> = {
    "x-bff-proxy": "nextjs-route-handler",
    "x-bff-secret": getBffSharedSecret(),
    ...(incomingAuth ? { authorization: incomingAuth } : {}),
  };

  try {
    const staffRes = await fetch(`${backendBase}/api/staff${search}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!staffRes.ok) {
      const errBody = await staffRes.text();
      return new NextResponse(errBody, { status: staffRes.status, headers: { "content-type": "application/json" } });
    }
    const rawRows = (await staffRes.json()) as Record<string, unknown>[];
    const sanitizedRows = sanitizeBffJson(rawRows) as Record<string, unknown>[];
    return NextResponse.json(
      {
        source: "nextjs-bff-employees-proxy",
        via_bff: true,
        role_scope: "directory_redacted",
        count: Array.isArray(sanitizedRows) ? sanitizedRows.length : 0,
        employees: sanitizedRows,
      },
      { status: 200, headers: { "x-bff-proxy": "nextjs-bff", "cache-control": "no-store" } },
    );
  } catch {
    return primaryRes;
  }
}
