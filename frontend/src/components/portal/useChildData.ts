"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Fetch `/api/portal/children/:id/<path>` for the selected child; refetches when the
 * child (or `path`, e.g. a month query) changes. Stale responses from a previous
 * child are dropped so a fast switch never shows the wrong child's data.
 */
export function useChildData<T>(childId: string | undefined, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!childId) return;
    let live = true;
    setLoading(true);
    setError(null);
    setData(null);
    apiFetch<T>(`/api/portal/children/${encodeURIComponent(childId)}/${path}`)
      .then((d) => { if (live) setData(d); })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : "Could not load"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [childId, path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
