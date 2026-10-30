/**
 * Same-origin Next.js BFF client (`apiFetch` & `apiDownload`).
 *
 * Architecture:
 *   React components (Browser)
 *     -> Same-origin `POST /api/_rpc` (or `/api/employees`)
 *     -> Next.js Route Handlers (BFF Server-Side Proxy)
 *     -> Server-to-server communication (`BACKEND_URL` + `X-BFF-Secret`)
 *     -> NestJS Backend (Controllers · Services · Guards · Database)
 *
 * Individual REST endpoints (`/api/students`, `/api/fees`, `/api/staff`, etc.)
 * are wrapped inside a base64-encoded BFF envelope sent to `/api/_rpc` so raw
 * backend routes and query strings are hidden from the browser Network tab.
 */
export const BASE = "";

export type BffLogEntry = {
  id: string;
  method: string;
  targetPath: string;
  bffRoute: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

const bffRingBuffer: BffLogEntry[] = [];
export function getBffCallLog(): readonly BffLogEntry[] {
  return bffRingBuffer;
}

function recordBffCall(entry: Omit<BffLogEntry, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  bffRingBuffer.unshift({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  });
  if (bffRingBuffer.length > 40) bffRingBuffer.pop();
}

function encodeBffEnvelope(envelope: {
  p: string;
  m: string;
  b?: string | null;
  h?: Record<string, string>;
}): string {
  const json = JSON.stringify(envelope);
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, "utf8").toString("base64");
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (!isFormData && init?.body) {
    headers["Content-Type"] = "application/json";
  }

  const startedAt = Date.now();
  let res: Response;

  if (isFormData) {
    res = await fetch("/api/_rpc", {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "x-bff-target": path,
        "x-bff-method": method,
      },
      body: init?.body,
      credentials: "same-origin",
    });
  } else {
    const payload = encodeBffEnvelope({
      p: path,
      m: method,
      b: typeof init?.body === "string" ? init.body : null,
      h: headers,
    });
    res = await fetch("/api/_rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ payload }),
      credentials: "same-origin",
      signal: init?.signal,
    });
  }

  recordBffCall({
    method,
    targetPath: path,
    bffRoute: "/api/_rpc",
    status: res.status,
    durationMs: Date.now() - startedAt,
  });

  // Expired / revoked / disabled session: go back to login instead of showing a
  // page full of error toasts. (Login itself returns 401 for bad passwords — skip it.)
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("branch_id");
    } catch { /* storage blocked */ }
    if (window.location.pathname !== "/login") window.location.href = "/login?expired=1";
  }

  if (!res.ok) {
    const errorBody = await res.text();
    let errorMessage = errorBody || res.statusText;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.message) errorMessage = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message;
      else if (parsed.error) errorMessage = parsed.error;
    } catch {
      // not JSON — use raw text
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

/** Download lifecycle broadcast for the download tray (components/DownloadTray). */
export type DownloadEvent = {
  id: string;
  name: string;
  phase: "start" | "progress" | "done" | "error";
  loaded?: number;
  total?: number;
  message?: string;
};
export const DOWNLOAD_EVENT = "erp:download";
function emitDownload(detail: DownloadEvent) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<DownloadEvent>(DOWNLOAD_EVENT, { detail }));
}

/**
 * Authenticated file download (CSV / XLSX / PDF) routed through the same-origin
 * Next.js BFF (`/api/_rpc`).
 */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  emitDownload({ id, name: fallbackName, phase: "start" });
  const startedAt = Date.now();
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const payload = encodeBffEnvelope({ p: path, m: "GET", h: headers });

    const res = await fetch("/api/_rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ payload }),
      credentials: "same-origin",
    });

    recordBffCall({
      method: "GET",
      targetPath: path,
      bffRoute: "/api/_rpc",
      status: res.status,
      durationMs: Date.now() - startedAt,
    });

    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message ?? j.error ?? msg; } catch { /* not JSON */ }
      throw new Error(msg || `Download failed (${res.status})`);
    }
    const cd = res.headers.get("content-disposition") ?? "";
    const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
    const total = Number(res.headers.get("content-length")) || 0;
    emitDownload({ id, name, phase: "progress", loaded: 0, total });

    let blob: Blob;
    const reader = res.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        emitDownload({ id, name, phase: "progress", loaded, total });
      }
      blob = new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") ?? "application/octet-stream" });
    } else {
      blob = await res.blob();
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    emitDownload({ id, name, phase: "done", loaded: blob.size, total: blob.size });
  } catch (e) {
    emitDownload({ id, name: fallbackName, phase: "error", message: e instanceof Error ? e.message : "Download failed" });
    throw e;
  }
}
