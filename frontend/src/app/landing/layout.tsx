import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Marketing landing page — not linked from the app yet, so keep it out of search results. */
export const metadata: Metadata = {
  title: "Genesis Lumia ERP — The calm, complete school operating system",
  description:
    "Admissions, attendance, timetable, exams, fees, hostel, gate desk, payroll and parent portals — one beautiful system for the whole school, built mobile-first.",
  robots: { index: false, follow: false },
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return children;
}
