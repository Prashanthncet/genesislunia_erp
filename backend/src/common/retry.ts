/**
 * Re-runs `fn` when it loses an insert race on a unique key (Prisma P2002), up to `tries`.
 * Concurrent upserts on the same key both read "missing" and both insert; on retry the
 * row exists and the upsert becomes an update. Use for writes two staff can make at once
 * (roll calls, marks entry).
 */
export async function retryOnUniqueRace<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002' || attempt >= tries) throw err;
    }
  }
}
