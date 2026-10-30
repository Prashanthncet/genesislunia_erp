export default function GlobalLoading() {
  return (
    <div
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <span className="h-1.5 w-44 overflow-hidden rounded-full bg-line-strong">
        <span
          className="block h-full w-1/3 rounded-full bg-brand-600"
          style={{ animation: "loader-sweep 1.1s var(--ease-smooth) infinite" }}
        />
      </span>
      <p className="text-[13px] font-medium text-ink-3">Loading Genesis Lumia ERP…</p>
    </div>
  );
}
