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
