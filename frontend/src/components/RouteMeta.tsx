"use client";

import { useEffect } from "react";

/**
 * Every page in this app is a client component ("use client"), so Next's
 * `export const metadata` is not available per-route. This sets the document
 * title and meta description from the client instead.
 *
 * `DashboardShell` calls `useRouteMeta(pathname)` once for the whole dashboard,
 * so adding a route here is enough for it to get a real browser-tab title.
 */
export const ROUTES: Record<string, { title: string; description: string; crumb: string }> = {
  "/": {
    title: "Dashboard",
    description: "Your role's overview: work queue, today's schedule and the numbers you act on.",
    crumb: "Dashboard",
  },
  "/students": {
    title: "Students",
    description: "The student master record: admission details, class, roll number and status.",
    crumb: "Students",
  },
  "/classes": {
    title: "Classes & Sections",
    description: "Every class and section in the branch, with strength, class teacher and capacity.",
    crumb: "Classes",
  },
  "/admissions": {
    title: "Admissions",
    description: "Nine-step admission workflow from parent links through to roll number allocation and approval.",
    crumb: "Admissions",
  },
  "/timetable": {
    title: "Timetable",
    description: "Live schedules, master grid, automatic generation and teacher substitution.",
    crumb: "Timetable",
  },
  "/academics": {
    title: "Academics",
    description: "Subjects, syllabus units, lesson plans and assignments.",
    crumb: "Academics",
  },
  "/exams": {
    title: "Exams & Report Cards",
    description: "Exam schedules and CBSE-style report cards generated from exam marks.",
    crumb: "Exams",
  },
  "/cbt": {
    title: "Computer Based Tests",
    description: "Question bank, timed tests, automatic grading and a manual grading queue.",
    crumb: "CBT Tests",
  },
  "/attendance": {
    title: "Attendance",
    description: "Mark daily attendance and review the monthly register with per-student percentages.",
    crumb: "Attendance",
  },
  "/fees": {
    title: "Fees",
    description: "Fee structures, invoice generation, offline payment collection and printable receipts.",
    crumb: "Fees",
  },
  "/leaves": {
    title: "Leaves & Gate Passes",
    description: "Staff and student leave requests and approvals; gate-pass requests for teaching staff.",
    crumb: "Leaves & Passes",
  },
  "/gate": {
    title: "Gate Desk",
    description: "Issue gate passes, verify the parent's code at the gate, check students out and in, pass records and visitors.",
    crumb: "Gate Desk",
  },
  "/hostel": {
    title: "Hostel",
    description: "Hostels, rooms, bed allocation, occupancy and the visitor log.",
    crumb: "Hostel",
  },
  "/staff": {
    title: "Staff & Payroll",
    description: "Staff records, salary structures and monthly payslip generation.",
    crumb: "Staff & Payroll",
  },
  "/discipline": {
    title: "Discipline",
    description: "Incident log with restricted confidential notes and a full safeguarding audit trail.",
    crumb: "Discipline",
  },
  "/reports": {
    title: "Reports",
    description: "Cross-module analytics with CSV export for students, fees and attendance.",
    crumb: "Reports",
  },
  "/notifications": {
    title: "Notifications",
    description: "Outbound SMS and email log from every module, with honest delivery status.",
    crumb: "Notifications",
  },
  "/settings": {
    title: "Settings",
    description: "Institution profile, academic session, account details and notification preferences.",
    crumb: "Settings",
  },
  "/account": {
    title: "My account",
    description: "Your profile, role, employment details, classes and linked records.",
    crumb: "My account",
  },
  "/account/password": {
    title: "Change password",
    description: "Set a new sign-in password.",
    crumb: "Change password",
  },
  "/portal": {
    title: "My portal",
    description: "Attendance, fees, marks, leave and messages for your child.",
    crumb: "Portal",
  },
  "/portal/attendance": {
    title: "Attendance",
    description: "Month-by-month attendance calendar.",
    crumb: "Attendance",
  },
  "/portal/fees": {
    title: "Fees",
    description: "Invoices, payments, online payment and receipts.",
    crumb: "Fees",
  },
  "/portal/results": {
    title: "Results & report card",
    description: "Exam marks by subject and the report card download.",
    crumb: "Results",
  },
  "/portal/timetable": {
    title: "Timetable",
    description: "The class timetable for the week, with today's substitutions.",
    crumb: "Timetable",
  },
  "/portal/leaves": {
    title: "Leave requests",
    description: "Ask the school for leave and follow its approval.",
    crumb: "Leave requests",
  },
  "/portal/gate-passes": {
    title: "Gate passes",
    description: "Gate pass history and status.",
    crumb: "Gate passes",
  },
  "/portal/messages": {
    title: "Notices & messages",
    description: "Notices from the school and the SMS, email and WhatsApp messages it sent you.",
    crumb: "Notices & messages",
  },
  "/portal/admission": {
    title: "Admission status",
    description: "Your admission application and each step of its progress.",
    crumb: "Admission status",
  },
  "/admission-form": {
    title: "Admission Form",
    description: "Parent-facing admission form. Complete the details for your child.",
    crumb: "Admission Form",
  },
  "/login": {
    title: "Sign in",
    description: "Sign in to the Genesis Lumia ERP school management system.",
    crumb: "Sign in",
  },
};

/** Dynamic routes, matched by prefix when there is no exact entry. */
const PREFIX_ROUTES: { prefix: string; title: string; description: string; crumb: string }[] = [
  {
    prefix: "/students/",
    title: "Student profile",
    description: "Read-only Student Master profile: class, house, guardians, attendance, fees and documents.",
    crumb: "Student profile",
  },
  {
    prefix: "/cbt/take",
    title: "Take test",
    description: "Timed online test.",
    crumb: "Take test",
  },
];

/**
 * One short line for the phone app bar (the document description is too long to sit under a
 * 19px title). Desktop never shows it, so this map only affects <768px.
 */
const TAGLINES: Record<string, string> = {
  "/": "Your day at a glance",
  "/students": "Manage and view all students",
  "/classes": "Classes, sections and class teachers",
  "/admissions": "Applications from enquiry to enrolment",
  "/timetable": "Schedules, substitutions and the week grid",
  "/academics": "Syllabus, lesson plans and assignments",
  "/exams": "Exams, marks and report cards",
  "/cbt": "Tests, question bank and grading",
  "/attendance": "Mark and review daily attendance",
  "/fees": "Invoices, payments and receipts",
  "/leaves": "Leave requests and approvals",
  "/gate": "Passes, exits, returns and visitors",
  "/hostel": "Rooms, beds and hostel attendance",
  "/staff": "Manage staff and payroll records",
  "/discipline": "Incidents and safeguarding",
  "/reports": "Cross-module analytics and exports",
  "/notifications": "SMS, email and notice log",
  "/settings": "School profile and preferences",
  "/account": "Your profile and sign-in details",
  "/account/password": "Set a new sign-in password",
  "/portal": "Your child's school day",
  "/portal/attendance": "Month-by-month attendance",
  "/portal/fees": "Invoices, payments and receipts",
  "/portal/results": "Marks and the report card",
  "/portal/timetable": "The class week and substitutions",
  "/portal/leaves": "Request leave and follow approval",
  "/portal/gate-passes": "Pass history and status",
  "/portal/messages": "Notices from the school",
  "/portal/admission": "Your application progress",
};

/** Dynamic routes get their own short line. */
const PREFIX_TAGLINES: { prefix: string; tagline: string }[] = [
  { prefix: "/students/", tagline: "Student master profile" },
  { prefix: "/cbt/take", tagline: "Timed online test" },
];

export function routeMeta(pathname: string) {
  return ROUTES[pathname] ?? PREFIX_ROUTES.find((r) => pathname.startsWith(r.prefix));
}

/** Short phone-app-bar subtitle for a route (exact, then by prefix). */
export function routeTagline(pathname: string): string {
  return (
    TAGLINES[pathname] ??
    PREFIX_TAGLINES.find((r) => pathname.startsWith(r.prefix))?.tagline ??
    ""
  );
}

const SUFFIX = " · Genesis Lumia ERP";

export function useRouteMeta(pathname: string) {
  useEffect(() => {
    const meta = routeMeta(pathname);
    const title = meta ? `${meta.title}${SUFFIX}` : `Genesis Lumia ERP — Sainik School`;
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
