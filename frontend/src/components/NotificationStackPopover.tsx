"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "academic" | "fees" | "attendance" | "system";
  unread?: boolean;
};

const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    title: "Mid-Term Examination Schedule Released",
    description: "Classes 8 to 10 exam timetables and hall tickets are now published.",
    time: "10m ago",
    type: "academic",
    unread: true,
  },
  {
    id: "2",
    title: "Fee Collection Milestone Reached",
    description: "Batch A collected ₹12,50,000 (72% target achieved today).",
    time: "1h ago",
    type: "fees",
    unread: true,
  },
  {
    id: "3",
    title: "Daily Morning Roll Call Completed",
    description: "Cadet parade attendance verified with 96.8% active attendance.",
    time: "3h ago",
    type: "attendance",
    unread: false,
  },
];

export function NotificationStackPopover() {
  const [isHovered, setIsHovered] = useState(false);
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS);

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Bell Trigger Button */}
      <Link
        href="/notifications"
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 ${
          isHovered
            ? "border-blue-400 bg-blue-50/70 text-blue-600 shadow-sm"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        <svg
          className="h-4.5 w-4.5 transition-transform duration-200"
          style={{ transform: isHovered ? "scale(1.1) rotate(8deg)" : "scale(1)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white shadow-xs">
            {unreadCount}
          </span>
        )}
      </Link>

      {/* Hover Dropdown Stack Menu */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-2xl shadow-slate-900/10 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 px-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">Notifications</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  {unreadCount} new
                </span>
              </div>
              <Link
                href="/notifications"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                View all
              </Link>
            </div>

            {/* Motion Stack Items */}
            <div className="mt-2 space-y-1.5">
              {notifications.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.2 }}
                  className={`group relative flex items-start gap-3 rounded-xl p-2.5 transition-all duration-150 hover:bg-slate-50 cursor-pointer ${
                    item.unread ? "bg-blue-50/40" : "bg-transparent"
                  }`}
                >
                  {/* Type Icon Badge */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      item.type === "academic"
                        ? "bg-purple-100 text-purple-600"
                        : item.type === "fees"
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-blue-100 text-blue-600"
                    }`}
                  >
                    {item.type === "academic" && (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    )}
                    {item.type === "fees" && (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    )}
                    {item.type === "attendance" && (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.title}</p>
                      <span className="shrink-0 text-[10px] font-medium text-slate-400">{item.time}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Unread indicator dot */}
                  {item.unread && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600 mt-1" />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-2 border-t border-slate-100 pt-2 text-center">
              <Link
                href="/notifications"
                className="block rounded-lg py-1.5 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              >
                Open Notification Center →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
