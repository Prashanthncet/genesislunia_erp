import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genesis ERP — Sainik School",
  description: "Education ERP for Sainik School (Next.js + NestJS)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
