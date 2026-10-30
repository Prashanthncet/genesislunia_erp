import { NextRequest, NextResponse } from "next/server";
import { proxyToNestBackend } from "@/lib/bff-proxy";

type RpcEnvelope = {
  /** Target API path, e.g. `/api/students?class_id=cls_10a` */
  p: string;
  /** HTTP method, e.g. `GET`, `POST`, `PUT`, `DELETE` */
  m?: string;
  /** Optional JSON string or body payload */
  b?: string | null;
  /** Optional custom headers */
  h?: Record<string, string>;
};

function decodeEnvelope(raw: string): RpcEnvelope | null {
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as RpcEnvelope;
    if (!parsed || typeof parsed.p !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Unified Opaque Next.js BFF Gateway (`POST /api/_rpc`).
 *
 * Hides individual REST endpoint paths, query strings, and HTTP methods in the
 * browser's Network tab. Every frontend `apiFetch()` and `apiDownload()` call
 * is sent as a same-origin `POST /api/_rpc` request to this Next.js Route Handler,
 * which decodes the envelope on the server and performs server-to-server
 * communication with the NestJS backend.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // Multipart FormData uploads (e.g. bulk upload or file attachments)
  if (contentType.includes("multipart/form-data")) {
    const targetPath = req.headers.get("x-bff-target") ?? "";
    const targetMethod = req.headers.get("x-bff-method") ?? "POST";
    if (!targetPath.startsWith("/api/")) {
      return NextResponse.json({ message: "Invalid BFF target path" }, { status: 400 });
    }
    const rawBody = await req.arrayBuffer();
    return proxyToNestBackend(req, {
      targetPath,
      method: targetMethod,
      body: rawBody,
      extraHeaders: { "content-type": contentType },
    });
  }

  let bodyJson: { payload?: string; p?: string; m?: string; b?: string | null; h?: Record<string, string> };
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ message: "Malformed BFF request payload" }, { status: 400 });
  }

  const env: RpcEnvelope | null =
    typeof bodyJson.payload === "string"
      ? decodeEnvelope(bodyJson.payload)
      : typeof bodyJson.p === "string"
        ? { p: bodyJson.p, m: bodyJson.m, b: bodyJson.b, h: bodyJson.h }
        : null;

  if (!env || !env.p.startsWith("/api/")) {
    return NextResponse.json({ message: "Invalid BFF endpoint target" }, { status: 400 });
  }

  const method = (env.m ?? "GET").toUpperCase();
  const headers: Record<string, string> = { ...(env.h ?? {}) };
  if (env.b && !headers["content-type"] && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await proxyToNestBackend(req, {
    targetPath: env.p,
    method,
    body: env.b ?? null,
    extraHeaders: headers,
  });

  // Clear HttpOnly cookies when logging out
  if (env.p === "/api/auth/logout") {
    res.cookies.delete("erp_token");
    res.cookies.delete("erp_dev_access");
  }

  return res;
}
