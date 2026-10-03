export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  // Remounts on every navigation in the App Router → replay the entrance animation per page.
  return <div className="animate-[fade-up_0.45s_var(--ease-out-soft)_both]">{children}</div>;
}