"use client";

import { useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: "alert" | "info" | "success" | "warning";
  module: string;
  isRead: boolean;
};

const INITIAL: NotificationItem[] = [
  {
    id: "1",
    title: "Automated Substitution Generated",
    message: "Teacher 'Col. Rajesh Sharma' marked absent. Auto-substitutions generated for Grade 10 English (Period 3).",
    timestamp: "Today, 10:15 AM",
    type: "warning",
    module: "Timetable",
    isRead: false,
  },
  {
    id: "2",
    title: "New Application Submitted",
    message: "Applicant 'Aditya Vardhan Singh' has submitted required documents for Grade 6 AO verification.",
    timestamp: "Today, 09:30 AM",
    type: "info",
    module: "Admissions",
    isRead: false,
  },
  {
    id: "3",
    title: "Fee Payment Verified",
    message: "Accounts Office verified fee payment of ₹45,000 for student 'Rahul Verma'.",
    timestamp: "Yesterday, 04:45 PM",
    type: "success",
    module: "Admissions",
    isRead: false,
  },
  {
    id: "4",
    title: "Room Conflict Detected",
    message: "Resource 'Lab 402' is double-booked for Physics Practicals in Period 5. Action required.",
    timestamp: "Yesterday, 11:20 AM",
    type: "alert",
    module: "Timetable",
    isRead: true,
  },
];

const TYPE_STYLES: Record<string, string> = {
  alert: "border-rose-200 bg-rose-50",
  info: "border-blue-200 bg-blue-50",
  success: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>(INITIAL);

  const toggle = (id: string) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n)));

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">{unread} unread notifications.</p>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((n) => (
          <div
            key={n.id}
            className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition ${TYPE_STYLES[n.type]} ${
              n.isRead ? "opacity-60" : ""
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{n.title}</h3>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {n.module}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{n.message}</p>
              <p className="mt-1 text-xs text-slate-400">{n.timestamp}</p>
            </div>
            <button
              onClick={() => toggle(n.id)}
              className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              {n.isRead ? "Mark Unread" : "Mark Read"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
