import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Genesis Lumia ERP — Sainik School",
  description: "School ERP for admissions, attendance, fees and academics.",
  applicationName: "Genesis Lumia ERP",
  icons: { icon: "/logo.png" },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased text-[#0F172A] bg-[#F8FAFC]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
