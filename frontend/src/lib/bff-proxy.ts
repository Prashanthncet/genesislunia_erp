import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

const STRIP_KEYS = new Set([
  "passwordHash",
  "parentOtp",
  "otpHash",
  "bffSecret",
]);

function isPlainObj(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function sanitizeBffJson(
  data: unknown,
  allowOneTimePassword = false,
  depth = 0,
): unknown {
  if (depth > 8 || data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeBffJson(item, allowOneTimePassword, depth + 1));
  }
  if (!isPlainObj(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (STRIP_KEYS.has(k)) continue;
    if (k === "password" && !allowOneTimePassword) continue;
    out[k] = sanitizeBffJson(v, allowOneTimePassword, depth + 1);
  }
  return out;
}

export function getBackendBaseUrl(): string {
  return (process.env.BACKEND_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

export function getBffSharedSecret(): string {
  return process.env.BFF_SHARED_SECRET ?? "genesis-bff-internal-s2s";
}

function verifyAccessCodeTimingSafe(provided: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(provided.trim()).digest();
  const b = crypto.createHash("sha256").update(expected.trim()).digest();
  return crypto.timingSafeEqual(a, b);
}

export type ProxyTargetOptions = {
  targetPath: string;
  method: string;
  body?: BodyInit | null;
  extraHeaders?: Record<string, string>;
};

/**
 * Core Next.js BFF (Backend-For-Frontend) server-to-server proxy.
 * Executes requests from the Next.js server to the NestJS backend so the browser
 * only ever communicates with same-origin Next.js Route Handlers.
 */
export async function proxyToNestBackend(
  req: NextRequest,
  opts: ProxyTargetOptions,
): Promise<NextResponse> {
  const backendBase = getBackendBaseUrl();
  const normalizedPath = opts.targetPath.startsWith("/")
    ? opts.targetPath
    : `/${opts.targetPath}`;
  const cleanPath = normalizedPath.split("?")[0];
  const method = opts.method.toUpperCase();

  // 1. Server-side Access Code Verification (verified on the server via SHA-256 timingSafeEqual)
  if (method === "POST" && cleanPath.endsWith("/auth/verify-access-code")) {
    let accessCode = "";
    try {
      if (typeof opts.body === "string") {
        const parsed = JSON.parse(opts.body) as { access_code?: string };
        accessCode = String(parsed.access_code ?? "");
      } else if (opts.body instanceof ArrayBuffer) {
        const text = Buffer.from(opts.body).toString("utf8");
        const parsed = JSON.parse(text) as { access_code?: string };
        accessCode = String(parsed.access_code ?? "");
      }
    } catch {
      accessCode = "";
    }

    const expectedCode = process.env.DEV_ACCESS_CODE || "GENESIS-DEV-2026";
    if (!accessCode || !verifyAccessCodeTimingSafe(accessCode, expectedCode)) {
      return NextResponse.json(
        { statusCode: 403, message: "Invalid access code" },
        { status: 403, headers: { "x-bff-proxy": "nextjs-bff", "cache-control": "no-store" } },
      );
    }

    const devToken = crypto
      .createHmac("sha256", getBffSharedSecret())
      .update(`dev_access:${Date.now()}`)
      .digest("hex");

    const res = NextResponse.json(
      {
        verified: true,
        dev_access_token: devToken,
        expires_in: "8h",
        message: "Access code verified by server. Console / Inspector unlocked for this session.",
      },
      { status: 200, headers: { "x-bff-proxy": "nextjs-bff", "cache-control": "no-store" } },
    );
    res.cookies.set("erp_dev_access", devToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }

  // 2. Live Security Architecture status
  if (method === "GET" && cleanPath.endsWith("/auth/security-architecture")) {
    return NextResponse.json(
      {
        via_bff: true,
        recommendations: [
          {
            feature: "Inspect detection",
            recommendation: "Best-effort only",
            status: "active",
            implementation:
              "Global DevToolsGuard intercepts F12, Ctrl+Shift+I/J/C/K, Ctrl+U, right-click inspect & docked console, requiring server-verified access code",
          },
          {
            feature: "Access code",
            recommendation: "Server-side verification",
            status: "active",
            implementation:
              "POST /api/auth/verify-access-code with SHA-256 crypto.timingSafeEqual & signed HttpOnly cookie",
          },
          {
            feature: "API protection",
            recommendation: "NestJS Guards",
            status: "active",
            implementation:
              "AuthGuard + RolesGuard + ThrottlerGuard across all controllers incl. /api/employees",
          },
          {
            feature: "API endpoints",
            recommendation: "Next.js proxy",
            status: "active",
            implementation:
              "Same-origin Next.js Route Handlers BFF (/api/_rpc, /api/employees, /api/[...path]) -> server-to-server NestJS",
          },
          {
            feature: "Sensitive data",
            recommendation: "Never send to unauthorized clients",
            status: "active",
            implementation:
              "Global SensitiveDataInterceptor + role-scoped Prisma select projections + BFF response sanitizer",
          },
        ],
      },
      { status: 200, headers: { "x-bff-proxy": "nextjs-bff", "cache-control": "no-store" } },
    );
  }

  const targetUrl = `${backendBase}${normalizedPath}`;
  const upstreamHeaders = new Headers();

  // Forward Authorization header, or fall back to HttpOnly erp_token cookie
  const incomingAuth =
    opts.extraHeaders?.["authorization"] ??
    opts.extraHeaders?.["Authorization"] ??
    req.headers.get("authorization");
  const cookieToken = req.cookies.get("erp_token")?.value;
  if (incomingAuth) {
    upstreamHeaders.set("authorization", incomingAuth);
  } else if (cookieToken) {
    upstreamHeaders.set("authorization", `Bearer ${cookieToken}`);
  }

  // Forward content-type if present
  const contentType =
    opts.extraHeaders?.["content-type"] ??
    opts.extraHeaders?.["Content-Type"] ??
    req.headers.get("content-type");
  if (contentType) {
    upstreamHeaders.set("content-type", contentType);
  }

  // Forward webhook signature if present
  const sig = req.headers.get("x-signature");
  if (sig) upstreamHeaders.set("x-signature", sig);

  // Forward client IP for accurate rate limiting on the NestJS backend
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) upstreamHeaders.set("x-forwarded-for", forwardedFor);

  // Attach server-to-server BFF authentication headers
  upstreamHeaders.set("x-bff-proxy", "nextjs-route-handler");
  upstreamHeaders.set("x-bff-secret", getBffSharedSecret());

  const hasBody = !["GET", "HEAD"].includes(method) && opts.body !== undefined && opts.body !== null;

  try {
    const upstreamRes = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      body: hasBody ? opts.body : undefined,
      redirect: "manual",
      cache: "no-store",
    });

    const resContentType = upstreamRes.headers.get("content-type") ?? "";
    const isJson = resContentType.includes("application/json");
    const allowOneTimePassword =
      method === "POST" && normalizedPath.includes("/admissions/trigger-links");

    let response: NextResponse;

    if (isJson) {
      const rawText = await upstreamRes.text();
      let parsed: unknown = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        return new NextResponse(rawText, {
          status: upstreamRes.status,
          headers: {
            "content-type": resContentType || "text/plain",
            "x-bff-proxy": "nextjs-bff",
            "cache-control": "no-store",
          },
        });
      }

      const sanitized = sanitizeBffJson(parsed, allowOneTimePassword);
      response = NextResponse.json(sanitized, {
        status: upstreamRes.status,
        headers: {
          "x-bff-proxy": "nextjs-bff",
          "cache-control": "no-store",
        },
      });

      // Set HttpOnly session cookie on successful login so server-to-server BFF routes
      // can authenticate even without client-side token headers.
      if (
        upstreamRes.ok &&
        normalizedPath.endsWith("/auth/login") &&
        isPlainObj(parsed) &&
        typeof parsed.token === "string"
      ) {
        response.cookies.set("erp_token", parsed.token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 8,
        });
      }
    } else {
      // Binary / PDF / CSV / XLSX download stream
      const arrayBuf = await upstreamRes.arrayBuffer();
      const outHeaders = new Headers();
      if (resContentType) outHeaders.set("content-type", resContentType);
      const cd = upstreamRes.headers.get("content-disposition");
      if (cd) outHeaders.set("content-disposition", cd);
      outHeaders.set("content-length", String(arrayBuf.byteLength));
      outHeaders.set("x-bff-proxy", "nextjs-bff");
      outHeaders.set("cache-control", "no-store");

      response = new NextResponse(arrayBuf, {
        status: upstreamRes.status,
        headers: outHeaders,
      });
    }

    return response;
  } catch {
    return NextResponse.json(
      {
        statusCode: 502,
        error: "Bad Gateway",
        message: "Unable to reach the backend service via Next.js BFF proxy.",
      },
      { status: 502, headers: { "x-bff-proxy": "nextjs-bff", "cache-control": "no-store" } },
    );
  }
}
