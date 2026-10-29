export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  // Remounts on every navigation in the App Router → replays the entrance
  // animation per page. Transform-only, so content is never hidden without it.
  return <div className="animate-page-enter">{children}</div>;
}
