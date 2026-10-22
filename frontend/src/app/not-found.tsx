import Link from "next/link";

export const metadata = {
  title: "Page not found — Genesis ERP",
  description: "The page you were looking for does not exist.",
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <span className="absolute left-[10%] top-[-6rem] h-72 w-72 animate-[float_9s_ease-in-out_infinite] rounded-full bg-brand-400/20 blur-3xl" />
        <span className="absolute right-[8%] bottom-[10%] h-72 w-72 animate-[float_12s_ease-in-out_infinite_reverse] rounded-full bg-accent-400/20 blur-3xl" />
      </div>

      <div className="card w-full max-w-md p-8" style={{ animation: "scale-in 0.4s var(--ease-spring) both" }}>
        <p className="font-mono text-6xl font-black tracking-tight text-brand-200">404</p>
        <h1 className="mt-2 text-xl font-bold text-ink">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-ink-2">
          The link may be out of date, or the page may have been renamed. Everything else in the
          ERP is still where you left it.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/" className="btn-primary">
            Back to dashboard
          </Link>
          <Link href="/login" className="btn-soft">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}