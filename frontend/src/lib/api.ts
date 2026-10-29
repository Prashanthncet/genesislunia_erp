export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isFormData = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (!isFormData && init?.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

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
      if (parsed.message) errorMessage = parsed.message;
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
 * Authenticated file download (CSV / XLSX / PDF). A plain <a href> or bare fetch
 * sends no Bearer token, gets a 401 JSON body, and saves THAT as the file.
 * Throws on non-2xx so callers can toast a real error.
 * Announces start / progress / done / error so the download tray can show it.
 */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  emitDownload({ id, name: fallbackName, phase: "start" });
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message ?? j.error ?? msg; } catch { /* not JSON */ }
      throw new Error(msg || `Download failed (${res.status})`);
    }
    const cd = res.headers.get("content-disposition") ?? "";
    const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
    const total = Number(res.headers.get("content-length")) || 0;
    emitDownload({ id, name, phase: "progress", loaded: 0, total });

    // Read the body in chunks so the tray can show real progress; same bytes either way.
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
    // Revoking too early cancels the save on iOS Safari / Firefox (they read the blob lazily).
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    emitDownload({ id, name, phase: "done", loaded: blob.size, total: blob.size });
  } catch (e) {
    emitDownload({ id, name: fallbackName, phase: "error", message: e instanceof Error ? e.message : "Download failed" });
    throw e;
  }
}
