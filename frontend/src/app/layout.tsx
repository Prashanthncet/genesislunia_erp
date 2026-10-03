import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genesis ERP — Sainik School",
  description: "School ERP for admissions, attendance, fees and academics.",
  applicationName: "Genesis Lumia ERP",
  icons: { icon: "/icon.svg" },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
