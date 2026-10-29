import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardShell from "@/components/DashboardShell";
import { MeProvider } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <MeProvider>
        <DashboardShell>{children}</DashboardShell>
      </MeProvider>
    </ProtectedRoute>
  );
}
