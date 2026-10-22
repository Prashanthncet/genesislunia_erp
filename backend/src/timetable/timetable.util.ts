const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_ORDER: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** 'YYYY-MM-DD' → 'Mon'…'Sun'. UTC so the answer doesn't depend on the server's time zone. */
export function dayOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? 'Mon' : DAY_NAMES[d.getUTCDay()];
}

/** Monday..Sunday ISO dates of the week containing `dateStr`. */
export function weekDates(dateStr: string): string[] {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export function classLabel(c: { name: string; section: string | null } | null | undefined): string {
  return c ? `${c.name}${c.section ? ` ${c.section}` : ''}` : '';
}
