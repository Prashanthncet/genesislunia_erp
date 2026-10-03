"use client";

import { useEffect } from "react";

/**
 * Every page in this app is a client component ("use client"), so Next's
 * `export const metadata` is not available per-route. This sets the title and
 * description from the client instead. Kept declarative so routes stay readable.
 */
const TITLES: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Dashboard — Genesis ERP",
    description: "School-wide overview: attendance, collections, admissions pipeline and module shortcuts.",
  },
  "/students": {
    title: "Students — Genesis ERP",
    description: "The student master record: admission details, class, roll number and status.",
  },
  "/admissions": {
    title: "Admissions — Genesis ERP",
    description: "Nine-step admission workflow from parent links through to roll number allocation and approval.",
  },
  "/fees": {
    title: "Fees — Genesis ERP",
    description: "Fee structures, invoice generation, offline payment collection and printable receipts.",
  },
  "/attendance": {
    title: "Attendance — Genesis ERP",
    description: "Mark daily attendance and review the monthly register with per-student percentages.",
  },
  "/timetable": {
    title: "Timetable — Genesis ERP",
    description: "Live schedules, master grid, automatic generation and teacher substitution.",
  },
  "/exams": {
    title: "Reports — Genesis ERP",
    description: "CBSE-style report cards generated from exam marks, with grades and pass percentages.",
  },
  "/cbt": {
    title: "Computer Based Tests — Genesis ERP",
    description: "Question bank, timed tests, automatic grading and a manual grading queue.",
  },
  "/academics": {
    title: "Academics — Genesis ERP",
    description: "Subjects, syllabus units, lesson plans and assignments.",
  },
  "/leaves": {
    title: "Leaves & Gate Passes — Genesis ERP",
    description: "Staff and student leave approvals plus the parent-OTP gate pass workflow.",
  },
  "/hostel": {
    title: "Hostel — Genesis ERP",
    description: "Hostels, rooms, bed allocation, occupancy and the visitor log.",
  },
  "/discipline": {
    title: "Discipline — Genesis ERP",
    description: "Incident log with restricted confidential notes and a full safeguarding audit trail.",
  },
  "/staff": {
    title: "Staff & Payroll — Genesis ERP",
    description: "Staff records, salary structures and monthly payslip generation.",
  },
  "/reports": {
    title: "Reports — Genesis ERP",
    description: "Cross-module analytics with CSV export for students, fees and attendance.",
  },
  "/notifications": {
    title: "Notifications — Genesis ERP",
    description: "Outbound SMS and email log from every module, with honest delivery status.",
  },
  "/admission-form": {
    title: "Admission Form — Genesis Lumia School",
    description: "Parent-facing admission form. Complete the details for your child.",
  },
  "/login": {
    title: "Sign in — Genesis ERP",
    description: "Sign in to the Genesis ERP school management system.",
  },
};

export function useRouteMeta(pathname: string) {
  useEffect(() => {
    const meta = TITLES[pathname];
    const title = meta?.title ?? "Genesis ERP — Sainik School";
    const description =
      meta?.description ?? "School ERP for admissions, attendance, fees and academics.";

    document.title = title;

    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", description);
  }, [pathname]);
}