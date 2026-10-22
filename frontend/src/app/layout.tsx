import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Inter everywhere — headings, body, tables. It stays legible at the dense
 * sizes an ERP uses all day, and one family keeps the type system calm.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});


export const metadata: Metadata = {
  title: {
    default: "Genesis Lumia ERP — Sainik School",
    template: "%s",
  },
  description:
    "Multi-tenant school ERP for Sainik School: admissions, attendance, timetable, exams, fees, hostel, staff and safeguarding.",
  applicationName: "Genesis Lumia ERP",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Genesis Lumia ERP — Sainik School",
    description: "Every child, every opportunity, every day.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#142b4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {/* Apply the saved motion preference before paint so nothing animates
            for someone who asked it not to. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('motion_pref')==='reduced'){document.documentElement.dataset.motion='reduced'}}" +
              "catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
