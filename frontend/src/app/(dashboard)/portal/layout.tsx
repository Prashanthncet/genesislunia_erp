"use client";

import { PortalProvider } from "@/components/portal/PortalContext";

/** All portal pages share one overview fetch and the selected-child state. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalProvider>{children}</PortalProvider>;
}
