/**
 * Genesis ERP — full demo seed.
 *
 * Two jobs, and both matter:
 *
 * 1. FIXTURES. The e2e suite (`test/api.e2e-spec.ts`) asserts against specific
 *    ids — `cls_10a`, `stu_001` (Aditya Vardhan Singh), `t_meera`, `t_rajesh`,
 *    `t_arjun`, `sub_mat`, `ex_1`, `ex_2`, `lab_402`. Those rows must exist or
 *    the suite fails, so they are created here with their exact ids. Several
 *    timetable slots are deliberately left EMPTY because tests fill them (see
 *    `RESERVED` below) — do not "tidy" those gaps.
 *
 * 2. DEMO DATA. Every module gets enough believable, internally consistent rows
 *    that no screen in the app is empty: classes, students, attendance, exams
 *    and marks, fees and payments, hostel and visitors, discipline and audit,
 *    leave and gate passes, admissions at every pipeline stage, syllabus,
 *    lesson plans, assignments, CBT tests, and the notification log.
 *
 * Deterministic: a fixed-seed RNG generates names, marks and attendance, so
 * re-running produces the same school. Idempotent: everything branch-scoped is
 * wiped first, in foreign-key-safe order.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

// The seed WIPES the demo branches before re-creating them. Never let that happen
// to a live school by accident.
if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
  console.error('Refusing to seed with NODE_ENV=production (it wipes branch data). Set SEED_ALLOW_PRODUCTION=1 to override.');
  process.exit(1);
}

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

const prisma = new PrismaClient();

const BRANCH = 'sainik01';
const SESSION = '2026-27';

/** Mon–Sat. Sunday is a holiday and is deliberately absent. */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Teaching periods. Period 3 is the short break and 7 is lunch, so they carry no lesson. */
const PERIODS = [1, 2, 4, 5, 6, 8];

/**
 * Timetable slots the e2e suite writes to. Generating lessons here would make
 * those tests fail, so they are skipped on purpose.
 */
const RESERVED = new Set(['cls_10b|Tue|1', 'cls_12_sci|Tue|1']);

/**
 * A Date `n` whole months before the seed anchor, on the 1st.
 *
 * History is spread rather than dumped into one month so the dashboard's
 * month-over-month charts show a real school year instead of a single spike.
 * Anchored to October 2026 so the seed stays deterministic.
 */
const SEED_ANCHOR = new Date('2026-10-01T00:00:00Z');
function monthsAgo(n: number): Date {
  return new Date(Date.UTC(SEED_ANCHOR.getUTCFullYear(), SEED_ANCHOR.getUTCMonth() - n, 1));
}

/** Deterministic PRNG so the generated school is identical on every run. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const rng = makeRng(20261015);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

/**
 * Curated full names, not first+last pairs from two pools. Independent pools
 * produce runs like "Aarav Bose, Aarav Menon, Aarav Naidu" once sorted, which
 * reads as obviously generated — the opposite of believable demo data.
 */
const STUDENT_NAMES = [
  'Aadhya Deshpande', 'Aarav Bose', 'Aditya Vardhan Singh', 'Akshay Kulkarni',
  'Ananya Banerjee', 'Aniket Trivedi', 'Anushka Reddy', 'Arjun Nair',
  'Arnav Chaturvedi', 'Aryan Kulkarni', 'Avani Menon', 'Bhavya Iyer',
  'Chirag Bhatia', 'Daksh Agarwal', 'Devansh Mehta', 'Dhruv Pandey',
  'Disha Kalra', 'Divyansh Rathore', 'Eeshan Naidu', 'Gauri Salvi',
  'Gautam Pillai', 'Harsh Sandhu', 'Hriday Sharma', 'Ishaan Verma',
  'Ishita Sen', 'Jai Thakur', 'Kabir Siddiqui', 'Kartik Malhotra',
  'Kavya Krishnan', 'Kritika Jain', 'Lakshya Chauhan', 'Madhav Rao',
  'Mahi Kapoor', 'Manav Joshi', 'Meghana Bhat', 'Mihir Saxena',
  'Nandini Ghosh', 'Neel Bhandari', 'Nikhil Raghavan', 'Nithya Suresh',
  'Omkar Deshmukh', 'Pari Goswami', 'Parth Vaidya', 'Pranav Dutta',
  'Prisha Choudhary', 'Rachit Mittal', 'Raghav Menon', 'Rashi Kulkarni',
  'Reyansh Goel', 'Rohan Pillai', 'Rudra Pratap Singh', 'Saanvi Kaur',
  'Sahil Barve', 'Sakshi Ranjan', 'Samar Chakraborty', 'Sanya Trivedi',
  'Sarthak Naik', 'Shreya Wagle', 'Siddharth Menon', 'Sneha Dubey',
  'Soham Kale', 'Tanvi Shetty', 'Tejas Bhosale', 'Trisha Nair',
  'Utkarsh Sinha', 'Vaishnavi Pillai', 'Vedant Phadke', 'Vihaan Sandhu',
  'Vinayak Hegde', 'Yash Deshpande', 'Yuvan Sood', 'Zoya Qureshi',
];

const HOUSES = ['Blue', 'Green', 'Red', 'Yellow'] as const;

/** Stable, readable ids for the staff the test suite references. */
type StaffSeed = {
  id: string;
  name: string;
  email: string;
  role: string;
  subjects: string;
  maxPeriods: number;
  basic: number;
  hra: number;
  da: number;
  tds: number;
  epf: number;
};

const STAFF: StaffSeed[] = [
  { id: 't_principal', name: 'Brig. Anil Kapoor (Retd.)', email: 'anil.kapoor@sainik01.edu', role: 'Principal', subjects: '', maxPeriods: 0, basic: 150000, hra: 60000, da: 18750, tds: 15, epf: 12 },
  { id: 't_os', name: 'Mr. Gopal Krishnan', email: 'gopal.k@sainik01.edu', role: 'Office Superintendent', subjects: '', maxPeriods: 0, basic: 42000, hra: 16800, da: 5250, tds: 5, epf: 12 },
  { id: 't_ao', name: 'Ms. Farah Siddiqui', email: 'farah.s@sainik01.edu', role: 'Admission Officer', subjects: '', maxPeriods: 0, basic: 38000, hra: 15200, da: 4750, tds: 5, epf: 12 },
  { id: 't_hr', name: 'Mrs. Lata Deshpande', email: 'lata.d@sainik01.edu', role: 'HR Manager', subjects: '', maxPeriods: 0, basic: 45000, hra: 18000, da: 5625, tds: 5, epf: 12 },
  { id: 't_security', name: 'Sub. Maj. Balwant Singh (Retd.)', email: 'balwant.s@sainik01.edu', role: 'Security Supervisor', subjects: '', maxPeriods: 0, basic: 28000, hra: 11200, da: 3500, tds: 0, epf: 12 },
  { id: 't_counsellor', name: 'Dr. Nandini Rao', email: 'nandini.rao@sainik01.edu', role: 'Counsellor & Safeguarding Lead', subjects: '', maxPeriods: 0, basic: 50000, hra: 20000, da: 6250, tds: 5, epf: 12 },
  { id: 't_rajesh', name: 'Col. Rajesh Sharma', email: 'rajesh@sainik01.edu', role: 'Teacher', subjects: 'English', maxPeriods: 4, basic: 120000, hra: 48000, da: 15000, tds: 10, epf: 0 },
  { id: 't_priya', name: 'Ms. Priya Menon', email: 'priya.menon@sainik01.edu', role: 'Vice Principal', subjects: 'English', maxPeriods: 4, basic: 90000, hra: 36000, da: 11250, tds: 10, epf: 12 },
  { id: 't_meera', name: 'Mrs. Meera Iyer', email: 'meera@sainik01.edu', role: 'Teacher', subjects: 'Maths', maxPeriods: 6, basic: 55000, hra: 22000, da: 6875, tds: 5, epf: 12 },
  { id: 't_arjun', name: 'Mr. Arjun Rao', email: 'arjun@sainik01.edu', role: 'Teacher', subjects: 'Physics', maxPeriods: 6, basic: 52000, hra: 20800, da: 6500, tds: 5, epf: 12 },
  { id: 't_kavya', name: 'Ms. Kavya Nair', email: 'kavya@sainik01.edu', role: 'Teacher', subjects: 'Chemistry', maxPeriods: 6, basic: 51000, hra: 20400, da: 6375, tds: 5, epf: 12 },
  { id: 't_sneha', name: 'Mrs. Sneha Iyer', email: 'sneha.iyer@sainik01.edu', role: 'Teacher', subjects: 'Physics, Chemistry', maxPeriods: 6, basic: 52000, hra: 20800, da: 6500, tds: 5, epf: 12 },
  { id: 't_vikram', name: 'Mr. Vikram Malhotra', email: 'vikram.m@sainik01.edu', role: 'Teacher', subjects: 'English, Communication Skills', maxPeriods: 6, basic: 48000, hra: 19200, da: 6000, tds: 5, epf: 12 },
  { id: 't_anjali', name: 'Mrs. Anjali Verma', email: 'anjali.verma@sainik01.edu', role: 'Teacher', subjects: 'Hindi, Sanskrit', maxPeriods: 6, basic: 45000, hra: 18000, da: 5625, tds: 5, epf: 12 },
  { id: 't_deepak', name: 'Mr. Deepak Kumar', email: 'deepak.kumar@sainik01.edu', role: 'Teacher', subjects: 'Physical Drill, Sports', maxPeriods: 8, basic: 50000, hra: 20000, da: 6250, tds: 5, epf: 12 },
  { id: 't_kavita', name: 'Mrs. Kavita Joshi', email: 'kavita.joshi@sainik01.edu', role: 'Teacher', subjects: 'History, Geography', maxPeriods: 6, basic: 47000, hra: 18800, da: 5875, tds: 5, epf: 12 },
  { id: 't_ramesh', name: 'Mr. Ramesh Patel', email: 'ramesh.patel@sainik01.edu', role: 'Teacher', subjects: 'Computer Science, I.T.', maxPeriods: 6, basic: 58000, hra: 23200, da: 7250, tds: 5, epf: 12 },
  { id: 't_neha', name: 'Mrs. Neha Agarwal', email: 'neha.agarwal@sainik01.edu', role: 'Teacher', subjects: 'Chemistry, Laboratory', maxPeriods: 6, basic: 53000, hra: 21200, da: 6625, tds: 5, epf: 12 },
  { id: 't_sanjay', name: 'Mr. Sanjay Bansal', email: 'sanjay.bansal@sainik01.edu', role: 'Accountant', subjects: '', maxPeriods: 0, basic: 40000, hra: 16000, da: 5000, tds: 10, epf: 12 },
  { id: 't_meenakshi', name: 'Mrs. Meenakshi Rao', email: 'meenakshi.rao@sainik01.edu', role: 'Librarian', subjects: '', maxPeriods: 0, basic: 35000, hra: 14000, da: 4375, tds: 5, epf: 12 },
  { id: 't_amit', name: 'Mr. Amit Khanna', email: 'amit.khanna@sainik01.edu', role: 'Warden', subjects: '', maxPeriods: 4, basic: 55000, hra: 22000, da: 6875, tds: 5, epf: 12 },
  { id: 't_pooja', name: 'Mrs. Pooja Sharma', email: 'pooja.sharma@sainik01.edu', role: 'Teacher', subjects: 'Biology, Zoology', maxPeriods: 6, basic: 51000, hra: 20400, da: 6375, tds: 5, epf: 12 },
  { id: 't_harish', name: 'Mr. Harish Chandra', email: 'harish.chandra@sainik01.edu', role: 'Teacher', subjects: 'Physics, NDA Physics', maxPeriods: 6, basic: 54000, hra: 21600, da: 6750, tds: 5, epf: 12 },
  { id: 't_divya', name: 'Mrs. Divya Singh', email: 'divya.singh@sainik01.edu', role: 'Teacher', subjects: 'Mathematics', maxPeriods: 6, basic: 46000, hra: 18400, da: 5750, tds: 5, epf: 12 },
  { id: 't_naveen', name: 'Mr. Naveen Kumar', email: 'naveen.kumar@sainik01.edu', role: 'Teacher', subjects: 'English Literature', maxPeriods: 6, basic: 49000, hra: 19600, da: 6125, tds: 5, epf: 12 },
  { id: 't_rekha', name: 'Mrs. Rekha Pandey', email: 'rekha.pandey@sainik01.edu', role: 'Teacher', subjects: 'Hindi, Literature', maxPeriods: 6, basic: 44000, hra: 17600, da: 5500, tds: 5, epf: 12 },
  { id: 't_sunil', name: 'Mr. Sunil Yadav', email: 'sunil.yadav@sainik01.edu', role: 'Teacher', subjects: 'Sports, Drill', maxPeriods: 8, basic: 47000, hra: 18800, da: 5875, tds: 5, epf: 12 },
  { id: 't_sangeeta', name: 'Mrs. Sangeeta Mishra', email: 'sangeeta.m@sainik01.edu', role: 'Teacher', subjects: 'Civics, Economics', maxPeriods: 6, basic: 48000, hra: 19200, da: 6000, tds: 5, epf: 12 },
];

/**
 * Timetable rotation pool. `t_meera` and `t_rajesh` sit at the END on purpose:
 * with `(classIndex + dayIndex + period) % POOL.length`, the first two slots of
 * Monday and the first slot of Tuesday never land on them, which is exactly the
 * freedom the substitution tests need.
 */
const TEACHING_POOL = [
  't_arjun', 't_sneha', 't_vikram', 't_anjali', 't_deepak', 't_kavita',
  't_ramesh', 't_neha', 't_harish', 't_pooja', 't_divya',
  't_meera', 't_rajesh',
];

type ClassSeed = { id: string; name: string; section: string | null; students: number; level: string };
const CLASSES: ClassSeed[] = [
  { id: 'cls_10a', name: 'Class 10', section: 'A', students: 12, level: 'Class 9-10' },
  { id: 'cls_10b', name: 'Class 10', section: 'B', students: 6, level: 'Class 9-10' },
  { id: 'cls_12_sci', name: 'Class 12', section: 'Science', students: 5, level: 'Class 11-12' },
  { id: 'cls_06a', name: 'Class 6', section: 'A', students: 8, level: 'Class 6-8' },
  { id: 'cls_07a', name: 'Class 7', section: 'A', students: 8, level: 'Class 6-8' },
  { id: 'cls_08a', name: 'Class 8', section: 'A', students: 8, level: 'Class 6-8' },
  { id: 'cls_09a', name: 'Class 9', section: 'A', students: 8, level: 'Class 9-10' },
  { id: 'cls_11_sci', name: 'Class 11', section: 'Science', students: 6, level: 'Class 11-12' },
];

type SubjectSeed = { id: string; name: string; code: string; level: string; groupId: number };
const SUBJECTS: SubjectSeed[] = [
  { id: 'sub_eng', name: 'English', code: 'ENG', level: 'Class 6-8', groupId: 1 },
  { id: 'sub_hin', name: 'Hindi', code: 'HIN', level: 'Class 6-8', groupId: 1 },
  { id: 'sub_mat', name: 'Mathematics', code: 'MAT', level: 'Class 9-10', groupId: 1 },
  { id: 'sub_sci', name: 'Science', code: 'SCI', level: 'Class 9-10', groupId: 2 },
  { id: 'sub_sst', name: 'Social Studies', code: 'SST', level: 'Class 9-10', groupId: 2 },
  { id: 'sub_phy', name: 'Physics', code: 'PHY', level: 'Class 11-12', groupId: 3 },
  { id: 'sub_che', name: 'Chemistry', code: 'CHE', level: 'Class 11-12', groupId: 3 },
  { id: 'sub_bio', name: 'Biology', code: 'BIO', level: 'Class 11-12', groupId: 3 },
  { id: 'sub_cs', name: 'Computer Science', code: 'CSC', level: 'Class 11-12', groupId: 4 },
  { id: 'sub_skt', name: 'Sanskrit', code: 'SKT', level: 'Class 6-8', groupId: 1 },
];

/** Fixed fixtures — names/classes must match what the tests assert. */
const FIXTURE_STUDENTS = [
  { id: 'stu_001', admissionNo: 'S2023-045', fullName: 'Aditya Vardhan Singh', gender: 'Male', classId: 'cls_10a' },
  { id: 'stu_002', admissionNo: 'S2023-046', fullName: 'Rahul Verma', gender: 'Male', classId: 'cls_10a' },
  { id: 'stu_003', admissionNo: 'S2023-047', fullName: 'Priya Menon', gender: 'Female', classId: 'cls_10a' },
  { id: 'stu_004', admissionNo: 'S2023-048', fullName: 'Vikram Malhotra', gender: 'Male', classId: 'cls_10b' },
];

/** Application statuses in workflow order (plan appendix). */
const ADMISSION_FLOW = [
  'Links Sent',
  'Submitted by Parent',
  'Re-submit',
  'Document Validated',
  'Payment Received',
  'Fee Approved',
  'Roll No Assigned',
  'VP Approved',
  'Admission Complete',
];

/** Every demo login. Keep in sync with README / DEMO_GUIDE. */
const DEMO_LOGINS: { id: string; email: string; password: string; role: string; name: string; staffId: string | null }[] = [
  { id: 'u_admin', email: 'admin@sainik01.edu', password: 'Admin@123', role: 'super_admin', name: 'System Administrator', staffId: null },
  { id: 'u_branchadmin', email: 'schooladmin@sainik01.edu', password: 'Demo@Admin1', role: 'branch_admin', name: 'School Administrator', staffId: null },
  { id: 'u_principal', email: 'principal@sainik01.edu', password: 'Demo@Principal1', role: 'principal', name: 'Brig. Anil Kapoor (Retd.)', staffId: 't_principal' },
  { id: 'u_vp', email: 'vp@sainik01.edu', password: 'Demo@Vp1', role: 'vice_principal', name: 'Ms. Priya Menon', staffId: 't_priya' },
  { id: 'u_os', email: 'os@sainik01.edu', password: 'Demo@Os1', role: 'office_superintendent', name: 'Mr. Gopal Krishnan', staffId: 't_os' },
  { id: 'u_ao', email: 'ao@sainik01.edu', password: 'Demo@Ao1', role: 'admission_officer', name: 'Ms. Farah Siddiqui', staffId: 't_ao' },
  { id: 'u_accounts', email: 'accounts@sainik01.edu', password: 'Demo@Accounts1', role: 'accounts', name: 'Mr. Sanjay Bansal', staffId: 't_sanjay' },
  { id: 'u_hr', email: 'hr@sainik01.edu', password: 'Demo@Hr1', role: 'hr', name: 'Mrs. Lata Deshpande', staffId: 't_hr' },
  { id: 'u_hod', email: 'hod@sainik01.edu', password: 'Demo@Hod1', role: 'hod', name: 'Mrs. Meera Iyer', staffId: 't_meera' },
  { id: 'u_teacher', email: 'teacher@sainik01.edu', password: 'Demo@Teacher1', role: 'teacher', name: 'Col. Rajesh Sharma', staffId: 't_rajesh' },
  { id: 'u_warden', email: 'warden@sainik01.edu', password: 'Demo@Warden1', role: 'warden', name: 'Mr. Amit Khanna', staffId: 't_amit' },
  { id: 'u_security', email: 'security@sainik01.edu', password: 'Demo@Security1', role: 'security', name: 'Sub. Maj. Balwant Singh (Retd.)', staffId: 't_security' },
  { id: 'u_discipline', email: 'discipline@sainik01.edu', password: 'Demo@Discipline1', role: 'discipline_officer', name: 'Dr. Nandini Rao', staffId: 't_counsellor' },
  // Parent of stu_001 and stu_004; student login for stu_001.
  { id: 'u_parent', email: 'parent@sainik01.edu', password: 'Demo@Parent1', role: 'parent', name: 'Mr. Devendra Singh', staffId: null },
  { id: 'u_student', email: 'student@sainik01.edu', password: 'Demo@Student1', role: 'student', name: 'Aditya Vardhan Singh', staffId: null },
];

/* ── Wipe ───────────────────────────────────────────────────────────────── */

async function wipe() {
  console.log('🧹 Clearing existing branch data (FK-safe order)...');
  const b = { branchId: BRANCH };

  await prisma.parentStudent.deleteMany({ where: b });
  await prisma.admissionStep.deleteMany({ where: b });
  await prisma.paymentOrder.deleteMany({ where: b });
  await prisma.gradeBand.deleteMany({ where: b });
  await prisma.hostelRollCall.deleteMany({ where: b });
  await prisma.auditLog.deleteMany({ where: b });
  await prisma.notificationLog.deleteMany({ where: b });
  await prisma.admissionDocument.deleteMany({ where: b });
  await prisma.admission.deleteMany({ where: b });
  await prisma.visitorLog.deleteMany({ where: b });
  await prisma.hostelAllocation.deleteMany({ where: { room: { hostel: b } } });
  await prisma.bed.deleteMany({ where: { room: { hostel: b } } });
  await prisma.room.deleteMany({ where: { hostel: b } });
  await prisma.hostel.deleteMany({ where: b });
  await prisma.gatePass.deleteMany({ where: b });
  await prisma.incident.deleteMany({ where: b });
  await prisma.studentLeave.deleteMany({ where: b });
  await prisma.staffLeave.deleteMany({ where: b });
  await prisma.offlinePayment.deleteMany({ where: b });
  await prisma.feeInvoice.deleteMany({ where: b });
  await prisma.feeStructure.deleteMany({ where: b });
  await prisma.payslip.deleteMany({ where: b });
  await prisma.salaryStructure.deleteMany({ where: { staff: b } });
  await prisma.examSchedule.deleteMany({ where: b });
  await prisma.examMark.deleteMany({ where: b });
  await prisma.exam.deleteMany({ where: b });
  await prisma.timetableSlot.deleteMany({ where: b });
  await prisma.substitution.deleteMany({ where: b });
  await prisma.lessonPlan.deleteMany({ where: b });
  await prisma.assignment.deleteMany({ where: b });
  await prisma.syllabus.deleteMany({ where: b });
  await prisma.cbtAttempt.deleteMany({ where: b });
  await prisma.cbtTest.deleteMany({ where: b });
  await prisma.cbtQuestion.deleteMany({ where: b });
  await prisma.attendanceRecord.deleteMany({ where: b });
  await prisma.user.deleteMany({ where: b });
  await prisma.student.deleteMany({ where: b });
  await prisma.subject.deleteMany({ where: b });
  await prisma.periodConfig.deleteMany({ where: b });
  await prisma.academicRoom.deleteMany({ where: b });
  await prisma.user.deleteMany({ where: b });
  await prisma.staff.deleteMany({ where: b });
  await prisma.admissionField.deleteMany({ where: b });
  await prisma.class.deleteMany({ where: b });
  console.log('✓ Cleared');
}

/**
 * A second, deliberately tiny school. It exists so tenant isolation can be tested:
 * nothing a sainik01 user does may ever read or write these rows.
 */
const BRANCH2 = 'greenfield02';
async function seedSecondSchool() {
  const b = { branchId: BRANCH2 };
  await prisma.branch.upsert({
    where: { id: BRANCH2 },
    create: { id: BRANCH2, code: 'GREENFIELD02', name: 'Greenfield Public School', location: 'Pune, India' },
    update: {},
  });
  await prisma.parentStudent.deleteMany({ where: b });
  await prisma.attendanceRecord.deleteMany({ where: b });
  await prisma.examMark.deleteMany({ where: b });
  await prisma.exam.deleteMany({ where: b });
  await prisma.feeInvoice.deleteMany({ where: b });
  await prisma.user.deleteMany({ where: b });
  await prisma.student.deleteMany({ where: b });
  await prisma.subject.deleteMany({ where: b });
  await prisma.staff.deleteMany({ where: b });
  await prisma.class.deleteMany({ where: b });

  await prisma.class.create({ data: { id: 'g2_cls_5a', branchId: BRANCH2, name: 'Class 5', section: 'A' } });
  await prisma.subject.create({ data: { id: 'g2_sub_mat', branchId: BRANCH2, name: 'Mathematics', code: 'G2MAT', level: 'Primary' } });
  await prisma.staff.create({ data: { id: 'g2_t_asha', branchId: BRANCH2, name: 'Mrs. Asha Kulkarni', email: 'asha@greenfield02.edu', role: 'Teacher', department: 'Mathematics' } });
  for (const [i, name] of ['Neel Joshi', 'Tara Bhosale'].entries()) {
    await prisma.student.create({
      data: { id: `g2_stu_00${i + 1}`, branchId: BRANCH2, admissionNo: `G2-2026-00${i + 1}`, fullName: name, classId: 'g2_cls_5a', mobileNumber: `90000000${i}1`, status: 'Active' },
    });
  }
  await prisma.exam.create({ data: { id: 'g2_ex_1', branchId: BRANCH2, name: 'Unit Test 1', date: '2026-09-10', classId: 'g2_cls_5a' } });
  await prisma.examMark.create({ data: { branchId: BRANCH2, examId: 'g2_ex_1', studentId: 'g2_stu_001', subjectId: 'g2_sub_mat', score: 88 } });
  await prisma.attendanceRecord.create({ data: { branchId: BRANCH2, studentId: 'g2_stu_001', classId: 'g2_cls_5a', date: '2026-10-01', status: 'Present' } });
  await prisma.feeInvoice.create({ data: { id: 'g2_inv_1', branchId: BRANCH2, studentId: 'g2_stu_001', term: 'Term 1', totalAmount: 18000, dueDate: '2026-07-15', status: 'Unpaid', invoiceNo: 'G2-INV-0001' } });
  const logins = [
    { id: 'g2_u_admin', email: 'admin@greenfield02.edu', password: 'Demo@Green1', role: 'branch_admin', staffId: null as string | null, studentId: null as string | null },
    { id: 'g2_u_teacher', email: 'teacher@greenfield02.edu', password: 'Demo@Green1', role: 'teacher', staffId: 'g2_t_asha', studentId: null },
    { id: 'g2_u_parent', email: 'parent@greenfield02.edu', password: 'Demo@Green1', role: 'parent', staffId: null, studentId: null },
  ];
  for (const l of logins) {
    await prisma.user.create({ data: { id: l.id, branchId: BRANCH2, email: l.email, password: await bcrypt.hash(l.password, 10), role: l.role, staffId: l.staffId, studentId: l.studentId } });
  }
  await prisma.parentStudent.create({ data: { branchId: BRANCH2, userId: 'g2_u_parent', studentId: 'g2_stu_001' } });
  console.log(`✓ Second school: ${BRANCH2} (1 class, 2 students, 3 logins) — for tenant-isolation tests`);
}

/* ── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  console.log('🌱 Seeding Genesis ERP demo data...\n');

  const branch = await prisma.branch.upsert({
    where: { id: BRANCH },
    create: { id: BRANCH, code: 'SAINIK01', name: 'Sainik School', location: 'New Delhi, India' },
    update: { code: 'SAINIK01', name: 'Sainik School', location: 'New Delhi, India' },
  });
  console.log(`✓ Branch: ${branch.name} (${branch.id})`);

  await wipe();

  /* ── Classes ─────────────────────────────────────────────────── */
  // Created across the academic session so the enrolment trend has real spread.
  for (const [ci, c] of CLASSES.entries()) {
    const age = Math.floor(((CLASSES.length - 1 - ci) / Math.max(1, CLASSES.length - 1)) * 11);
    await prisma.class.create({
      data: {
        id: c.id,
        branchId: BRANCH,
        name: c.name,
        section: c.section,
        createdAt: monthsAgo(age),
      },
    });
  }
  console.log(`✓ Classes: ${CLASSES.length} (created across the session)`);

  /* ── Subjects ────────────────────────────────────────────────── */
  for (const s of SUBJECTS) {
    await prisma.subject.create({
      data: { id: s.id, branchId: BRANCH, name: s.name, code: s.code, level: s.level, groupId: s.groupId },
    });
  }
  console.log(`✓ Subjects: ${SUBJECTS.length}`);

  /* ── Staff + salary structures ───────────────────────────────── */
  const departmentOf = (st: StaffSeed): string => {
    if (st.role !== 'Teacher') {
      if (/Principal/.test(st.role)) return 'Administration';
      if (/Accountant/.test(st.role)) return 'Accounts';
      if (/Warden/.test(st.role)) return 'Hostel';
      if (/Security/.test(st.role)) return 'Security';
      if (/HR/.test(st.role)) return 'Human Resources';
      if (/Counsellor/.test(st.role)) return 'Student Welfare';
      return 'Office';
    }
    if (/Math/.test(st.subjects)) return 'Mathematics';
    if (/Physics|Chemistry|Biology|Zoology|Laboratory/.test(st.subjects)) return 'Science';
    if (/English|Hindi|Sanskrit|Literature|Communication/.test(st.subjects)) return 'Languages';
    if (/History|Geography|Civics|Economics/.test(st.subjects)) return 'Social Science';
    if (/Computer/.test(st.subjects)) return 'Computer Science';
    if (/Sports|Drill/.test(st.subjects)) return 'Physical Education';
    return 'General';
  };
  for (const s of STAFF) {
    await prisma.staff.create({
      data: {
        id: s.id,
        branchId: BRANCH,
        name: s.name,
        email: s.email,
        role: s.role,
        department: departmentOf(s),
        phone: `98${String(10000000 + Math.floor(rng() * 89999999)).slice(0, 8)}`,
        subjects: s.subjects || null,
        maxPeriodsPerDay: s.maxPeriods,
        isActive: true,
      },
    });
    await prisma.salaryStructure.create({
      data: {
        staffId: s.id,
        basicSalary: s.basic,
        hra: s.hra,
        da: s.da,
        tdsPercent: s.tds,
        epfPercent: s.epf,
      },
    });
  }
  console.log(`✓ Staff: ${STAFF.length} (+ salary structures)`);

  // Class teachers (teacher@ = Col. Rajesh Sharma is class teacher of 10 A).
  const CLASS_TEACHERS: Record<string, string> = {
    cls_10a: 't_rajesh', cls_10b: 't_vikram', cls_12_sci: 't_harish', cls_06a: 't_anjali',
    cls_07a: 't_divya', cls_08a: 't_deepak', cls_09a: 't_kavita', cls_11_sci: 't_neha',
  };
  for (const [classId, staffId] of Object.entries(CLASS_TEACHERS)) {
    await prisma.class.update({ where: { id: classId }, data: { classTeacherId: staffId } });
  }
  console.log(`✓ Class teachers: ${Object.keys(CLASS_TEACHERS).length}`);

  /* ── Users ───────────────────────────────────────────────────── */
  // One login per role in the delivery plan. Parent and student logins are created
  // after the students exist (below). Passwords are documented in DEMO_LOGINS.
  const users = DEMO_LOGINS.filter((u) => u.role !== 'parent' && u.role !== 'student');
  for (const u of users) {
    await prisma.user.create({
      data: {
        id: u.id,
        branchId: BRANCH,
        email: u.email,
        password: await bcrypt.hash(u.password, 10),
        role: u.role,
        name: u.name,
        staffId: u.staffId,
      },
    });
  }
  console.log(`✓ Staff users: ${users.length} (one per role)`);

  /* ── Students ────────────────────────────────────────────────── */
  let admissionSeq = 1001;
  const students: { id: string; fullName: string; classId: string; admissionNo: string }[] = [];

  // Fixtures first, so their ids and names are guaranteed.
  for (const f of FIXTURE_STUDENTS) {
    await prisma.student.create({
      data: {
        id: f.id,
        branchId: BRANCH,
        admissionNo: f.admissionNo,
        fullName: f.fullName,
        fatherName: `Mr. ${f.fullName.split(' ').slice(-1)[0]}`,
        motherName: `Mrs. ${f.fullName.split(' ').slice(-1)[0]}`,
        mobileNumber: `98${String(10000000 + Math.floor(rng() * 8999999)).slice(0, 8)}`,
        gender: f.gender,
        bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-']),
        heightCm: 150 + Math.round(rng() * 25),
        weightKg: 40 + Math.round(rng() * 25),
        vision: '6/6',
        classId: f.classId,
        rollNo: `10${f.classId === 'cls_10a' ? 'A' : 'B'}${f.id.slice(-2)}`,
        house: HOUSES[Number(f.id.slice(-2)) % HOUSES.length],
        enrollmentDate: '2023-04-05',
        // Oldest month, so the fixtures don't pile into the current month.
        createdAt: monthsAgo(11),
        status: 'Active',
      },
    });
    students.push({ id: f.id, fullName: f.fullName, classId: f.classId, admissionNo: f.admissionNo });
  }

  // Generated cohort on top of the fixtures, drawn from the curated name list.
  const usedNames = new Set(FIXTURE_STUDENTS.map((f) => f.fullName));
  let nameCursor = 0;
  const nextName = (): string => {
    for (let i = 0; i < STUDENT_NAMES.length; i++) {
      const candidate = STUDENT_NAMES[(nameCursor + i) % STUDENT_NAMES.length].trim();
      if (!usedNames.has(candidate)) {
        nameCursor = (nameCursor + i + 1) % STUDENT_NAMES.length;
        usedNames.add(candidate);
        return candidate;
      }
    }
    return `Student ${usedNames.size + 1}`;
  };

  // Generated students are spread EVENLY across the last 12 months. A random
  // spread makes the enrolment trend jump 1 → 11 → 2 per month, which reads as a
  // broken chart rather than a school year.
  const totalGenerated = CLASSES.reduce(
    (n, c) => n + (c.students - FIXTURE_STUDENTS.filter((f) => f.classId === c.id).length),
    0,
  );

  let seq = 0;
  for (const cls of CLASSES) {
    const fixturesHere = FIXTURE_STUDENTS.filter((f) => f.classId === cls.id).length;
    for (let i = fixturesHere; i < cls.students; i++) {
      seq += 1;
      const fullName = nextName();

      const id = `stu_${String(seq + 100).padStart(3, '0')}`;
      const admissionNo = `S2026-${admissionSeq++}`;
      const gender = rng() > 0.32 ? 'Male' : 'Female';
      const className = cls.name.split(' ')[1] ?? '6';

      await prisma.student.create({
        data: {
          id,
          branchId: BRANCH,
          admissionNo,
          fullName,
          fatherName: `Mr. ${fullName.split(' ')[1]}`,
          motherName: `Mrs. ${fullName.split(' ')[1]}`,
          mobileNumber: `9${String(700000000 + Math.floor(rng() * 89999999)).slice(0, 9)}`,
          email: `${fullName.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`,
          gender,
          bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'B-', 'O-']),
          heightCm: 135 + Math.round(rng() * 35),
          weightKg: 32 + Math.round(rng() * 35),
          vision: rng() > 0.85 ? '6/9 — spectacles' : '6/6',
          classId: cls.id,
          rollNo: `${className}${cls.section ?? 'A'}${String(i + 1).padStart(2, '0')}`,
          house: HOUSES[(seq + i) % HOUSES.length],
          // Even intake across the last year so the enrolment trend is a real ramp.
          enrollmentDate: monthsAgo(11 - Math.min(11, Math.floor(((seq - 1) * 12) / Math.max(1, totalGenerated)))).toISOString().slice(0, 10),
          createdAt: monthsAgo(11 - Math.min(11, Math.floor(((seq - 1) * 12) / Math.max(1, totalGenerated)))),
          status: 'Active',
        },
      });
      students.push({ id, fullName, classId: cls.id, admissionNo });
    }
  }
  console.log(`✓ Students: ${students.length} across ${CLASSES.length} classes`);

  /* ── Rooms & period config ───────────────────────────────────── */
  const rooms = [
    { id: 'room_101', name: 'Room 101', type: 'Classroom', capacity: 40 },
    { id: 'room_102', name: 'Room 102', type: 'Classroom', capacity: 40 },
    { id: 'lab_402', name: 'Lab 402', type: 'Lab', capacity: 40 },
    { id: 'room_103', name: 'Room 103', type: 'Classroom', capacity: 36 },
    { id: 'lib_201', name: 'Library Hall', type: 'Library', capacity: 60 },
    { id: 'hall_01', name: 'Assembly Hall', type: 'Hall', capacity: 400 },
  ];
  for (const r of rooms) {
    await prisma.academicRoom.create({ data: { ...r, branchId: BRANCH } });
  }

  const periodTimes: [number, string, string, boolean, string | null][] = [
    [1, '08:00', '08:45', false, null],
    [2, '08:45', '09:30', false, null],
    [3, '09:30', '10:15', true, 'Short Break'],
    [4, '10:45', '11:30', false, null],
    [5, '11:30', '12:15', false, null],
    [6, '12:15', '13:00', false, null],
    // Lunch is a real row in the bell schedule so every timetable view can show it.
    [7, '13:00', '14:00', true, 'Lunch Break'],
    [8, '14:00', '14:45', false, null],
    [9, '14:45', '15:30', false, null],
  ];
  for (const [n, start, end, isBreak, breakName] of periodTimes) {
    await prisma.periodConfig.create({
      data: { branchId: BRANCH, periodNumber: n, startTime: start, endTime: end, isBreak, breakName },
    });
  }
  console.log(`✓ Academic rooms: ${rooms.length}, period configs: ${periodTimes.length}`);

  /* ── Timetable ───────────────────────────────────────────────── */
  const slotRows: {
    branchId: string; classId: string; dayOfWeek: string; periodNumber: number;
    subject: string; teacherId: string; roomId: string;
  }[] = [];
  const lessonSubjects = ['Mathematics', 'English', 'Science', 'Hindi', 'Social Studies', 'Physics', 'Computer Science', 'Physical Drill'];

  CLASSES.forEach((cls, ci) => {
    DAYS.forEach((day, di) => {
      PERIODS.forEach((p) => {
        if (RESERVED.has(`${cls.id}|${day}|${p}`)) return;
        const rawTeacherId = TEACHING_POOL[(ci + di + p) % TEACHING_POOL.length];
        const teacherId = rawTeacherId === 't_rajesh' && cls.id !== 'cls_10a' && cls.id !== 'cls_09a' ? 't_naveen' : rawTeacherId;
        slotRows.push({
          branchId: BRANCH,
          classId: cls.id,
          dayOfWeek: day,
          periodNumber: p,
          subject: lessonSubjects[(ci + di + p) % lessonSubjects.length],
          teacherId,
          roomId: rooms[(ci + di) % 3].id,
        });
      });
    });
  });

  // The two documented fixtures the substitution tests rely on.
  const overrideRoom = (classId: string, day: string, period: number, teacherId: string, subject: string) => {
    const row = slotRows.find((r) => r.classId === classId && r.dayOfWeek === day && r.periodNumber === period);
    if (row) { row.teacherId = teacherId; row.subject = subject; }
    else {
      slotRows.push({
        branchId: BRANCH, classId, dayOfWeek: day, periodNumber: period,
        subject, teacherId, roomId: 'room_101',
      });
    }
  };
  overrideRoom('cls_10a', 'Mon', 1, 't_meera', 'Mathematics');
  overrideRoom('cls_10a', 'Mon', 2, 't_rajesh', 'English');
  overrideRoom('cls_10a', 'Mon', 4, 't_arjun', 'Physics');
  overrideRoom('cls_10a', 'Mon', 5, 't_rajesh', 'English');
  overrideRoom('cls_10a', 'Mon', 8, 't_rajesh', 'English');

  await prisma.timetableSlot.createMany({ data: slotRows });
  console.log(`✓ Timetable slots: ${slotRows.length} (${RESERVED.size} slots reserved for tests)`);

  /* ── Substitutions (deliberately not on the dates tests use) ──── */
  await prisma.substitution.createMany({
    data: [
      { branchId: BRANCH, date: '2026-10-05', classId: 'cls_09a', periodNumber: 1, originalTeacherId: 't_kavita', substituteTeacherId: 't_sangeeta', roomId: 'room_102', reason: 'On duty — NDA counselling', createdBy: 't_priya' },
      { branchId: BRANCH, date: '2026-10-06', classId: 'cls_10a', periodNumber: 2, originalTeacherId: 't_rajesh', substituteTeacherId: 't_naveen', roomId: 'room_101', reason: 'Medical leave', createdBy: 't_priya' },
      { branchId: BRANCH, date: '2026-10-07', classId: 'cls_08a', periodNumber: 5, originalTeacherId: 't_deepak', substituteTeacherId: 't_sunil', roomId: 'room_103', reason: 'Inter-house drill practice', createdBy: 't_priya' },
      { branchId: BRANCH, date: '2026-10-09', classId: 'cls_11_sci', periodNumber: 4, originalTeacherId: 't_harish', substituteTeacherId: 't_arjun', roomId: 'lab_402', reason: 'Laboratory supervision', createdBy: 't_priya' },
    ],
  });

  /* ── Exams, schedules, marks ─────────────────────────────────── */
  const exams = [
    { id: 'ex_1', name: 'Mid-Term Examinations 2026', date: '2026-07-20', classId: 'cls_10a' },
    { id: 'ex_2', name: 'Final CBSE Examinations 2026', date: '2026-07-25', classId: 'cls_10a' },
    { id: 'ex_3', name: 'Term I Unit Test 2026-27', date: '2026-11-10', classId: 'cls_09a' },
    { id: 'ex_4', name: 'Pre-Board Examination 2026-27', date: '2026-12-08', classId: 'cls_12_sci' },
  ];
  for (const e of exams) {
    await prisma.exam.create({ data: { ...e, branchId: BRANCH } });
  }

  // Schedules avoid 2026-07-20 period 1 (lab_402 / t_arjun), which a test creates.
  const invigilators = ['t_kavya', 't_sneha', 't_vikram', 't_rekha', 't_neha', 't_ramesh'];
  const examSchedules = [
    { examId: 'ex_1', date: '2026-07-21', periodNumber: 1, roomId: 'room_101', invigilatorId: 't_kavya', subject: 'Mathematics' },
    { examId: 'ex_1', date: '2026-07-21', periodNumber: 2, roomId: 'room_102', invigilatorId: 't_sneha', subject: 'Science' },
    { examId: 'ex_1', date: '2026-07-22', periodNumber: 1, roomId: 'room_103', invigilatorId: 't_vikram', subject: 'English' },
    { examId: 'ex_2', date: '2026-07-27', periodNumber: 1, roomId: 'room_101', invigilatorId: 't_rekha', subject: 'Hindi' },
    { examId: 'ex_2', date: '2026-07-28', periodNumber: 1, roomId: 'room_102', invigilatorId: 't_neha', subject: 'Social Studies' },
    { examId: 'ex_3', date: '2026-11-10', periodNumber: 1, roomId: 'room_103', invigilatorId: 't_ramesh', subject: 'Mathematics' },
    { examId: 'ex_4', date: '2026-12-08', periodNumber: 1, roomId: 'hall_01', invigilatorId: 't_harish', subject: 'Physics' },
  ];
  await prisma.examSchedule.createMany({
    data: examSchedules.map((s) => ({ ...s, branchId: BRANCH })),
  });

  /**
   * Marks. `stu_001` × `ex_1` deliberately omits `sub_mat`, because a test
   * records exactly that triple and expects a fresh insert.
   */
  const markPairs: { examId: string; studentId: string; subjectId: string; mean?: number }[] = [
    { examId: 'ex_1', studentId: 'stu_001', subjectId: 'sub_eng' },
    { examId: 'ex_1', studentId: 'stu_001', subjectId: 'sub_sci' },
    { examId: 'ex_1', studentId: 'stu_002', subjectId: 'sub_mat' },
    { examId: 'ex_1', studentId: 'stu_002', subjectId: 'sub_eng' },
    { examId: 'ex_1', studentId: 'stu_003', subjectId: 'sub_mat' },
    { examId: 'ex_1', studentId: 'stu_003', subjectId: 'sub_sst' },
    { examId: 'ex_2', studentId: 'stu_001', subjectId: 'sub_mat' },
    { examId: 'ex_2', studentId: 'stu_001', subjectId: 'sub_hin' },
    { examId: 'ex_2', studentId: 'stu_002', subjectId: 'sub_sci' },
    { examId: 'ex_2', studentId: 'stu_003', subjectId: 'sub_eng' },
  ];

  /**
   * Marks for every class against both 2026 exams, so the dashboard's
   * "average score by exam" comparison has a bar per class rather than one.
   * Each class gets its own mean, so the bars actually differ.
   *
   * `(ex_1, stu_001, sub_mat)` is deliberately left unmarked — the e2e suite
   * records exactly that triple and asserts it inserts one fresh row.
   */
  for (const [ci, cls] of CLASSES.entries()) {
    const cohort = students.filter((s) => s.classId === cls.id);
    const mean = 54 + (ci % 5) * 7; // 54…82, varied per class
    for (const examId of ['ex_1', 'ex_2']) {
      for (const subjectId of ['sub_mat', 'sub_eng', 'sub_sci']) {
        for (const st of cohort) {
          const key = `${examId}|${st.id}|${subjectId}`;
          if (key === 'ex_1|stu_001|sub_mat') continue;
          if (markPairs.some((m) => `${m.examId}|${m.studentId}|${m.subjectId}` === key)) continue;
          markPairs.push({ examId, studentId: st.id, subjectId, mean });
        }
      }
    }
  }

  await prisma.examMark.createMany({
    data: markPairs.map((m) => ({
      branchId: BRANCH,
      examId: m.examId,
      studentId: m.studentId,
      subjectId: m.subjectId,
      score: Math.min(98, Math.max(26, Math.round((m.mean ?? 62) + (rng() - 0.5) * 28))),
      maxScore: 100,
    })),
  });
  console.log(`✓ Exams: ${exams.length}, schedules: ${examSchedules.length}, marks: ${markPairs.length}`);

  /* ── Attendance ──────────────────────────────────────────────── */
  /**
   * Roll calls for four school months (Mon–Sat; Sunday is a holiday), so the
   * attendance trend has real spread instead of one month's spike.
   *
   * 2026-09-29 is deliberately EXCLUDED: the e2e suite marks `cls_10a` on that
   * date and asserts the GET returns exactly the two records it posted.
   */
  const attendanceDates: string[] = [];
  for (const d = new Date('2026-07-01T00:00:00Z'); d <= new Date('2026-10-14T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) continue;
    const iso = d.toISOString().slice(0, 10);
    if (iso === '2026-09-29') continue;
    attendanceDates.push(iso);
  }
  const attendanceRows: {
    branchId: string; studentId: string; classId: string; date: string;
    status: string; markedBy: string; notified: number;
  }[] = [];
  for (const date of attendanceDates) {
    for (const st of students) {
      const roll = rng();
      const status = roll > 0.93 ? 'Absent' : roll > 0.9 ? 'Leave' : 'Present';
      attendanceRows.push({
        branchId: BRANCH,
        studentId: st.id,
        classId: st.classId,
        date,
        status,
        markedBy: pick(TEACHING_POOL),
        notified: status === 'Absent' ? 1 : 0,
      });
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendanceRows });
  const presentCount = attendanceRows.filter((a) => a.status === 'Present').length;
  console.log(
    `✓ Attendance: ${attendanceRows.length} records over ${attendanceDates.length} days ` +
    `(${((presentCount / attendanceRows.length) * 100).toFixed(1)}% present)`,
  );

  /* ── Fee structures, invoices, payments ──────────────────────── */
  const feeTypes = [
    { feeType: 'Tuition Fee', amount: 45000 },
    { feeType: 'Hostel Fee', amount: 32000 },
    { feeType: 'Transport Fee', amount: 12000 },
    { feeType: 'Laboratory Fee', amount: 6000 },
    { feeType: 'Sports & Drill Fee', amount: 8000 },
  ];
  for (const cls of CLASSES) {
    for (const f of feeTypes) {
      await prisma.feeStructure.create({
        data: { branchId: BRANCH, classId: cls.id, feeType: f.feeType, amount: f.amount },
      });
    }
  }

  let invoiceSeq = 0;
  let receiptSeq = 0;
  const paymentModes = ['Cash', 'UPI', 'Cheque', 'NEFT'];

  /**
   * Monthly billing across the session.
   *
   * The dashboard's collection trend is a per-month chart, so billing is per
   * month too — two term-sized spikes would leave the chart almost empty.
   * Payments land inside their own invoice's month, so per month
   * collected + outstanding reconciles exactly against invoiced.
   */
  const monthlyFee = Math.round(feeTypes.reduce((sum, f) => sum + f.amount, 0) / 8);
  const billingMonths = [
    { term: 'Apr 2026', due: '2026-04-10' },
    { term: 'May 2026', due: '2026-05-10' },
    { term: 'Jun 2026', due: '2026-06-10' },
    { term: 'Jul 2026', due: '2026-07-10' },
    { term: 'Aug 2026', due: '2026-08-10' },
    { term: 'Sep 2026', due: '2026-09-10' },
    { term: 'Oct 2026', due: '2026-10-10' },
    { term: 'Nov 2026', due: '2026-11-10' },
  ];
  // Older months are largely settled; the most recent two are still in progress.
  const settleChance = [0.94, 0.92, 0.9, 0.84, 0.72, 0.58, 0.4, 0.2];

  for (const st of students) {
    for (const [mi, t] of billingMonths.entries()) {
      invoiceSeq += 1;
      const invoice = await prisma.feeInvoice.create({
        data: {
          branchId: BRANCH,
          studentId: st.id,
          term: t.term,
          totalAmount: monthlyFee,
          dueDate: t.due,
          status: 'Unpaid',
          invoiceNo: `INV-2026-${String(invoiceSeq).padStart(4, '0')}`,
        },
      });

      if (rng() < settleChance[mi]) {
        receiptSeq += 1;
        const full = rng() > 0.22;
        const amountPaid = full ? monthlyFee : Math.round(monthlyFee * (0.35 + rng() * 0.4));
        const settled = amountPaid >= monthlyFee;
        const month = t.due.slice(0, 7);
        await prisma.offlinePayment.create({
          data: {
            branchId: BRANCH,
            invoiceId: invoice.id,
            amountPaid,
            paymentMode: pick(paymentModes),
            referenceNo: `TXN${String(900000 + Math.floor(rng() * 99999))}`,
            // Day capped at 28 so every month is a valid date.
            paymentDate: `${month}-${String(3 + Math.floor(rng() * 26)).padStart(2, '0')}`,
            collectedBy: 't_sanjay',
            receiptNo: `RCPT-2026-${String(receiptSeq).padStart(4, '0')}`,
          },
        });
        await prisma.feeInvoice.update({
          where: { id: invoice.id },
          data: { status: settled ? 'Paid' : 'Partial' },
        });
      }
    }
  }
  console.log(
    `✓ Fees: ${feeTypes.length * CLASSES.length} structures, ${invoiceSeq} invoices ` +
    `over ${billingMonths.length} months, ${receiptSeq} receipts`,
  );

  /* ── Hostel, rooms, allocations, visitors ────────────────────── */
  const hostels = [
    { id: 'hst_junior', name: 'Subhash Chandra Bose House', capacity: 120, wardenId: 't_amit' },
    { id: 'hst_senior', name: 'Bhagat Singh House', capacity: 90, wardenId: 't_amit' },
  ];
  for (const h of hostels) {
    await prisma.hostel.create({ data: { ...h, branchId: BRANCH } });
  }

  const roomRows: { id: string; hostelId: string; roomNumber: string; capacity: number }[] = [];
  for (const h of hostels) {
    for (let i = 1; i <= 6; i++) {
      roomRows.push({
        id: `rm_${h.id.slice(4, 6)}${String(i).padStart(2, '0')}`,
        hostelId: h.id,
        roomNumber: `${h.id === 'hst_junior' ? 'J' : 'S'}-${100 + i}`,
        capacity: 4,
      });
    }
  }
  await prisma.room.createMany({ data: roomRows });

  // Every room gets beds B1..B{capacity}; allocations point at a specific bed.
  const bedRows = roomRows.flatMap((r) =>
    Array.from({ length: r.capacity }, (_, i) => ({ id: `${r.id}_b${i + 1}`, roomId: r.id, label: `B${i + 1}` })),
  );
  await prisma.bed.createMany({ data: bedRows });

  // Allocate the senior cohort to free beds in order.
  const boarders = students.filter((s) => ['cls_09a', 'cls_10a', 'cls_10b', 'cls_11_sci', 'cls_12_sci'].includes(s.classId));
  let allocationCount = 0;
  for (const [i, st] of boarders.entries()) {
    const bed = bedRows[i];
    if (!bed) break;
    await prisma.hostelAllocation.create({ data: { studentId: st.id, roomId: bed.roomId, bedId: bed.id, bedLabel: bed.label } });
    allocationCount += 1;
  }

  await prisma.visitorLog.createMany({
    data: [
      { branchId: BRANCH, hostelId: 'hst_junior', visitorName: 'Mr. Devendra Singh', visitorPhone: '9812345670', whomToMeet: 'Aditya Vardhan Singh (Class 10 A)', purpose: 'Monthly visit', inTime: '2026-10-04T10:20:00', outTime: '2026-10-04T12:05:00', passNo: 'VIS-1041' },
      { branchId: BRANCH, hostelId: 'hst_senior', visitorName: 'Mrs. Lalitha Rao', visitorPhone: '9823456781', whomToMeet: 'Arjun Rao (Class 12 Science)', purpose: 'Medical checkup pickup', inTime: '2026-10-08T09:40:00', outTime: '2026-10-08T11:10:00', passNo: 'VIS-1042' },
      { branchId: BRANCH, hostelId: 'hst_junior', visitorName: 'Mr. Faizal Khan', visitorPhone: '9834567892', whomToMeet: 'Warden — Mr. Amit Khanna', purpose: 'Fee payment', inTime: '2026-10-11T15:05:00', outTime: null, passNo: 'VIS-1043' },
    ],
  });
  console.log(`✓ Hostel: ${hostels.length} hostels, ${roomRows.length} rooms, ${bedRows.length} beds, ${allocationCount} bed allocations, 3 visitors`);

  /* ── Discipline + audit ──────────────────────────────────────── */
  const incidents = [
    { studentId: 'stu_002', reportedBy: 't_deepak', incidentDate: '2026-09-18', description: 'Late for morning roll call for the third time this month.', actionTaken: 'Counselled; extra drill practice assigned.', demerits: 2, status: 'Closed', confidentialNotes: 'Parents informed by phone. No underlying issue reported.' },
    { studentId: 'stu_004', reportedBy: 't_vikram', incidentDate: '2026-10-03', description: 'Disruption during English period after repeated warnings.', actionTaken: 'Written apology; class teacher informed.', demerits: 3, status: 'Under Review', confidentialNotes: 'Sits with a student he distracts — seating to be changed.' },
    { studentId: 'stu_001', reportedBy: 't_amit', incidentDate: '2026-10-09', description: 'Hostel room inspection found an unregistered electrical appliance.', actionTaken: 'Appliance confiscated; returned at term end.', demerits: 1, status: 'Closed', confidentialNotes: null },
    { studentId: 'stu_003', reportedBy: 't_kavya', incidentDate: '2026-10-12', description: 'Missing laboratory notebook for two consecutive practicals.', actionTaken: 'Pending submission by Friday.', demerits: 0, status: 'Open', confidentialNotes: null },
  ];
  await prisma.incident.createMany({ data: incidents.map((i) => ({ ...i, branchId: BRANCH })) });

  const auditRows: { action: string; entity: string; entityId: string; detail: string }[] = [];
  for (const i of incidents) {
    auditRows.push({ action: 'CREATE', entity: 'incident', entityId: i.incidentDate, detail: `Incident logged against ${i.studentId}` });
    auditRows.push({ action: 'VIEW', entity: 'incident', entityId: i.incidentDate, detail: 'Confidential notes viewed by Principal' });
  }
  auditRows.push({ action: 'UPDATE', entity: 'incident', entityId: '2026-10-03', detail: 'Status moved Open → Under Review' });
  await prisma.auditLog.createMany({ data: auditRows.map((a) => ({ ...a, branchId: BRANCH, actorId: 'u_principal' })) });
  console.log(`✓ Discipline: ${incidents.length} incidents, ${auditRows.length} audit entries`);

  /* ── Leaves, gate passes ─────────────────────────────────────── */
  await prisma.staffLeave.createMany({
    data: [
      { branchId: BRANCH, staffId: 't_arjun', leaveType: 'Casual', startDate: '2026-10-10', endDate: '2026-10-11', reason: 'Family event', status: 'Approved', approvedBy: 't_priya' },
      { branchId: BRANCH, staffId: 't_kavya', leaveType: 'Sick', startDate: '2026-10-15', endDate: '2026-10-16', reason: 'Medical appointment', status: 'Approved', approvedBy: 't_priya' },
      { branchId: BRANCH, staffId: 't_deepak', leaveType: 'Casual', startDate: '2026-10-20', endDate: '2026-10-20', reason: 'Personal work', status: 'Pending', approvedBy: null },
      { branchId: BRANCH, staffId: 't_kavita', leaveType: 'Earned', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Annual leave', status: 'Pending', approvedBy: null },
      { branchId: BRANCH, staffId: 't_sneha', leaveType: 'Maternity', startDate: '2026-09-01', endDate: '2026-10-31', reason: 'Maternity leave', status: 'Approved', approvedBy: 't_priya' },
      { branchId: BRANCH, staffId: 't_vikram', leaveType: 'Casual', startDate: '2026-09-22', endDate: '2026-09-22', reason: 'Personal', status: 'Rejected', approvedBy: 't_priya' },
    ],
  });

  await prisma.studentLeave.createMany({
    data: [
      { branchId: BRANCH, studentId: 'stu_001', leaveType: 'Medical', startDate: '2026-10-05', endDate: '2026-10-07', reason: 'Viral fever', status: 'Approved', approvedBy: 't_priya' },
      { branchId: BRANCH, studentId: 'stu_004', leaveType: 'Family', startDate: '2026-10-12', endDate: '2026-10-13', reason: 'Sister\'s wedding', status: 'Approved', approvedBy: 't_priya' },
      { branchId: BRANCH, studentId: 'stu_002', leaveType: 'Medical', startDate: '2026-10-19', endDate: '2026-10-20', reason: 'Dental procedure', status: 'Pending', approvedBy: null },
      { branchId: BRANCH, studentId: 'stu_003', leaveType: 'Family', startDate: '2026-10-26', endDate: '2026-10-27', reason: 'Family function out of station', status: 'Pending', approvedBy: null },
    ],
  });

  await prisma.gatePass.createMany({
    data: [
      { branchId: BRANCH, studentId: 'stu_001', type: 'Local Outing', reason: 'Medical checkup at city hospital', outTime: '2026-10-05T09:00:00', expectedInTime: '2026-10-05T13:00:00', actualInTime: '2026-10-05T12:40:00', status: 'Returned', approvedByWarden: 't_amit', approvedByPrincipal: 't_priya', parentOtp: sha256('482913'), otpVerified: true },
      { branchId: BRANCH, studentId: 'stu_004', type: 'Term Leave', reason: 'Sister\'s wedding', outTime: '2026-10-12T07:30:00', expectedInTime: '2026-10-13T18:00:00', actualInTime: null, status: 'Checked Out', approvedByWarden: 't_amit', approvedByPrincipal: 't_priya', parentOtp: sha256('770412'), otpVerified: true },
      { branchId: BRANCH, studentId: 'stu_002', type: 'Local Outing', reason: 'Dental appointment', outTime: '2026-10-19T10:00:00', expectedInTime: '2026-10-19T14:00:00', actualInTime: null, status: 'Pending', approvedByWarden: null, approvedByPrincipal: null, parentOtp: null, otpVerified: false },
      { branchId: BRANCH, studentId: 'stu_003', type: 'Local Outing', reason: 'Bank work with guardian', outTime: '2026-10-22T11:00:00', expectedInTime: '2026-10-22T16:00:00', actualInTime: null, status: 'Pending', approvedByWarden: 't_amit', approvedByPrincipal: null, parentOtp: null, otpVerified: false },
    ],
  });
  console.log('✓ Leaves: 6 staff, 4 student, 4 gate passes');

  /* ── Admissions ──────────────────────────────────────────────── */
  const admissionFields = [
    { label: 'Student Name', fieldType: 'text', isRequired: true },
    { label: 'Date of Birth', fieldType: 'date', isRequired: true },
    { label: 'Father\'s Name', fieldType: 'text', isRequired: true },
    { label: 'Mother\'s Name', fieldType: 'text', isRequired: true },
    { label: 'Aadhaar Number', fieldType: 'text', isRequired: true, validationRule: '^[0-9]{12}$' },
    { label: 'Previous School', fieldType: 'text', isRequired: false },
    { label: 'Blood Group', fieldType: 'select', isRequired: false },
  ];
  for (const f of admissionFields) {
    await prisma.admissionField.create({
      data: { branchId: BRANCH, label: f.label, fieldType: f.fieldType, isRequired: f.isRequired, validationRule: f.validationRule ?? null, status: 'Published', academicYear: SESSION, sortOrder: admissionFields.indexOf(f) },
    });
  }

  const applicants = [
    'Karan Deshmukh', 'Ishita Banerjee', 'Rudra Pratap Singh', 'Meghna Pillai', 'Aryan Kulkarni',
    'Sanya Trivedi', 'Devansh Mehta', 'Nikita Rathore', 'Om Prakash Yadav', 'Trisha Nair',
    'Harsh Sandhu', 'Aisha Khan', 'Veer Chauhan', 'Ritika Bose', 'Manav Joshi',
    'Pooja Reddy', 'Sarthak Naidu', 'Anjali Kaur', 'Yash Deshpande', 'Sneha Pillai',
    'Aarush Verma', 'Bhavya Iyer', 'Chirag Sharma', 'Dhriti Menon', 'Eshan Patel',
  ];

  let admissionsCreated = 0;
  let admissionIndex = 0;
  let tokenSeq = 1000;
  let docsCreated = 0;

  for (const stage of ADMISSION_FLOW) {
    const perStage = stage === 'Admission Form Link' ? 6 : 3;
    for (let i = 0; i < perStage; i++) {
      const name = applicants[admissionIndex % applicants.length];
      admissionIndex += 1;
      const token = `adm_${tokenSeq++}`;
      const isComplete = ['Roll No Assigned', 'VP Approved', 'Admission Complete'].includes(stage);
      const admission = await prisma.admission.create({
        data: {
          branchId: BRANCH,
          studentName: name,
          dob: `201${2 + (admissionIndex % 5)}-0${1 + (admissionIndex % 9)}-1${admissionIndex % 9}`,
          parentName: `Mr. ${name.split(' ')[1]}`,
          parentContact: `98${String(100000000 + Math.floor(rng() * 89999999)).slice(0, 9)}`,
          parentEmail: `${name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`,
          status: stage,
          rollNo: isComplete ? `${2026}${String(admissionIndex).padStart(3, '0')}` : null,
          house: isComplete ? HOUSES[admissionIndex % HOUSES.length] : null,
          paymentStatus: ['Fee Approved', 'VP Approved', 'Roll No Assigned', 'Admission Complete'].includes(stage)
            ? 'Verified' : stage === 'Payment Received' ? 'Paid' : 'Pending',
          remarks: stage === 'Re-submit' ? 'Birth certificate scan is unreadable — please upload a clearer copy.' : null,
          academicYear: SESSION,
          feeAmount: 25000,
          linkExpiresAt: new Date(SEED_ANCHOR.getTime() + 15 * 86400000),
          submittedAt: stage === 'Links Sent' ? null : SEED_ANCHOR,
          loginId: stage === 'Admission Form Link' ? null : `GUEST${String(admissionIndex).padStart(4, '0')}`,
          token,
          classId: isComplete ? 'cls_06a' : null,
        },
      });
      admissionsCreated += 1;

      if (['Document Validated', 'Payment Received', 'Fee Approved', 'VP Approved', 'Roll No Assigned', 'Admission Complete'].includes(stage)) {
        await prisma.admissionDocument.create({
          data: {
            branchId: BRANCH,
            admissionId: admission.id,
            docType: 'aadhaar',
            fileName: 'aadhaar.png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+p6cSAAAAAElFTkSuQmCC',
            sizeBytes: 1024,
          },
        });
        docsCreated += 1;
      }
    }
  }
  console.log(`✓ Admissions: ${admissionsCreated} applications across ${ADMISSION_FLOW.length} stages, ${admissionFields.length} form fields, ${docsCreated} documents`);

  /* ── Academics: syllabus, lesson plans, assignments ──────────── */
  const syllabusRows: { id: string; classId: string; subjectId: string; title: string; description: string }[] = [];
  const chapterTitles = [
    'Real Numbers and Euclid\'s Division Lemma',
    'Polynomials and Factorisation',
    'Motion, Force and Gravitation',
    'Chemical Reactions and Equations',
    'Nationalism in India — Non-Cooperation Movement',
    'Grammar: Tenses, Voice and Reported Speech',
  ];
  CLASSES.forEach((cls, ci) => {
    SUBJECTS.slice(0, 5).forEach((sub, si) => {
      syllabusRows.push({
        id: `syl_${cls.id}_${sub.code}`,
        classId: cls.id,
        subjectId: sub.id,
        title: chapterTitles[(ci + si) % chapterTitles.length],
        description: `Unit ${1 + ((ci + si) % 4)} of the 2026-27 syllabus for ${sub.name} (${cls.name} ${cls.section ?? ''}).`,
      });
    });
  });
  await prisma.syllabus.createMany({
    data: syllabusRows.map((s) => ({
      id: s.id, branchId: BRANCH, classId: s.classId, subjectId: s.subjectId,
      title: s.title, description: s.description,
    })),
  });

  const lessonRows: { branchId: string; syllabusId: string; teacherId: string; topic: string; date: string; status: string }[] = [];
  const topics = ['Introduction and previous knowledge test', 'Guided practice with worked examples', 'Group activity and board work', 'Homework review and doubt clearing', 'Unit revision and mock questions'];
  syllabusRows.forEach((s, i) => {
    for (let l = 0; l < 3; l++) {
      lessonRows.push({
        branchId: BRANCH,
        syllabusId: s.id,
        teacherId: TEACHING_POOL[(i + l) % TEACHING_POOL.length],
        topic: topics[(i + l) % topics.length],
        date: `2026-10-${String(1 + ((i + l) % 20)).padStart(2, '0')}`,
        status: l === 0 ? 'Completed' : l === 1 ? 'In Progress' : 'Planned',
      });
    }
  });
  await prisma.lessonPlan.createMany({ data: lessonRows });

  const assignmentRows: { branchId: string; classId: string; subjectId: string; teacherId: string; title: string; description: string; dueDate: string }[] = [];
  const assignmentTitles = ['Worksheet 4 — Trigonometry', 'Map work: Indian rivers', 'Lab record: Ohm\'s Law', 'Essay: My role as a cadet', 'Grammar drill: active to passive'];
  CLASSES.forEach((cls, ci) => {
    SUBJECTS.slice(0, 4).forEach((sub, si) => {
      assignmentRows.push({
        branchId: BRANCH,
        classId: cls.id,
        subjectId: sub.id,
        teacherId: TEACHING_POOL[(ci + si) % TEACHING_POOL.length],
        title: assignmentTitles[(ci + si) % assignmentTitles.length],
        description: `Submit in the ${sub.name} notebook. Marks count towards the internal assessment.`,
        dueDate: `2026-10-${String(18 + ((ci + si) % 10)).padStart(2, '0')}`,
      });
    });
  });
  await prisma.assignment.createMany({ data: assignmentRows });
  console.log(`✓ Academics: ${syllabusRows.length} syllabus units, ${lessonRows.length} lesson plans, ${assignmentRows.length} assignments`);

  /* ── CBT ─────────────────────────────────────────────────────── */
  const mcqBank = [
    { question: 'The degree of the polynomial 4x³ − 2x + 7 is:', optionA: '1', optionB: '2', optionC: '3', optionD: '4', correctOption: 'C', subjectId: 'sub_mat' },
    { question: 'The SI unit of force is:', optionA: 'Joule', optionB: 'Newton', optionC: 'Watt', optionD: 'Pascal', correctOption: 'B', subjectId: 'sub_phy' },
    { question: 'Which gas is released when zinc reacts with dilute HCl?', optionA: 'Oxygen', optionB: 'Chlorine', optionC: 'Hydrogen', optionD: 'Nitrogen', correctOption: 'C', subjectId: 'sub_che' },
    { question: 'The Non-Cooperation Movement was launched in:', optionA: '1919', optionB: '1920', optionC: '1930', optionD: '1942', correctOption: 'B', subjectId: 'sub_sst' },
    { question: 'Choose the correct passive form of "She wrote a letter."', optionA: 'A letter was written by her.', optionB: 'A letter is written by her.', optionC: 'A letter has written by her.', optionD: 'A letter wrote by her.', correctOption: 'A', subjectId: 'sub_eng' },
    { question: 'The LCM of 12 and 18 is:', optionA: '24', optionB: '36', optionC: '48', optionD: '72', correctOption: 'B', subjectId: 'sub_mat' },
  ];
  const subjectiveBank = [
    { question: 'Prove that √2 is irrational, showing each step of the argument.', subjectId: 'sub_mat', marks: 4 },
    { question: 'State Newton\'s three laws of motion and give one practical example of each.', subjectId: 'sub_phy', marks: 4 },
  ];

  const questionIds: string[] = [];
  for (const [i, q] of mcqBank.entries()) {
    const qid = `cbq_m${i + 1}`;
    questionIds.push(qid);
    await prisma.cbtQuestion.create({
      data: { id: qid, branchId: BRANCH, classId: 'cls_10a', subjectId: q.subjectId, question: q.question, type: 'mcq', optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD, correctOption: q.correctOption, marks: 1 },
    });
  }
  const subjectiveIds: string[] = [];
  for (const [i, q] of subjectiveBank.entries()) {
    const qid = `cbq_s${i + 1}`;
    subjectiveIds.push(qid);
    await prisma.cbtQuestion.create({
      data: { id: qid, branchId: BRANCH, classId: 'cls_10a', subjectId: q.subjectId, question: q.question, type: 'subjective', marks: q.marks },
    });
  }

  const allQ = [...questionIds, ...subjectiveIds];
  const cbtTests = [
    { id: 'cbt_1', title: 'Mathematics Unit Test — Real Numbers', subjectId: 'sub_mat', durationMin: 30, status: 'Completed', startsAt: '2026-10-06T09:00:00' },
    { id: 'cbt_2', title: 'Science Practice Test — Motion & Force', subjectId: 'sub_phy', durationMin: 45, status: 'Published', startsAt: '2026-10-20T09:00:00' },
    { id: 'cbt_3', title: 'Social Studies Revision — Freedom Struggle', subjectId: 'sub_sst', durationMin: 25, status: 'Draft', startsAt: null },
  ];
  for (const t of cbtTests) {
    await prisma.cbtTest.create({
      data: {
        id: t.id, branchId: BRANCH, title: t.title, classId: 'cls_10a', subjectId: t.subjectId,
        durationMin: t.durationMin, status: t.status, startsAt: t.startsAt,
        questionIds: JSON.stringify(allQ), createdBy: 't_ramesh',
      },
    });
  }

  // Attempts on the completed test, with honest auto-graded scores.
  let attemptCount = 0;
  const cls10 = students.filter((s) => s.classId === 'cls_10a');
  for (const st of cls10.slice(0, 8)) {
    const answers: Record<string, string> = {};
    let score = 0;
    for (const [i, q] of mcqBank.entries()) {
      const correct = rng() > 0.25;
      const chosen = correct ? q.correctOption : pick(['A', 'B', 'C', 'D']);
      answers[`cbq_m${i + 1}`] = chosen;
      if (chosen === q.correctOption) score += 1;
    }
    // Subjective answers stay ungraded (score null) until a teacher marks them.
    for (const sid of subjectiveIds) answers[sid] = 'Written answer submitted by the student.';

    await prisma.cbtAttempt.create({
      data: {
        branchId: BRANCH, testId: 'cbt_1', studentId: st.id,
        answers: JSON.stringify(answers),
        score: null, maxScore: allQ.length,
      },
    });
    attemptCount += 1;
  }
  console.log(`✓ CBT: ${allQ.length} questions, ${cbtTests.length} tests, ${attemptCount} attempts awaiting manual grading`);

  /* ── Notification log ────────────────────────────────────────── */
  const notifyTemplates = [
    { channel: 'sms', refType: 'attendance', subject: null, body: 'Your ward was marked ABSENT today. Please contact the class teacher if this is unexpected.' },
    { channel: 'email', refType: 'admission', subject: 'Admission form link', body: 'Please complete the online admission form using the secure link sent to you. It expires in 7 days.' },
    { channel: 'sms', refType: 'gate_pass', subject: null, body: 'Gate pass approved. The parent OTP is required at the main gate for checkout.' },
    { channel: 'email', refType: 'payroll', subject: 'Payslip for the month is ready', body: 'Your payslip has been generated and is available in the Staff & Payroll module.' },
    { channel: 'email', refType: 'fees', subject: 'Fee payment receipt', body: 'Payment received. Your receipt has been generated and can be printed from the Fees module.' },
    { channel: 'sms', refType: 'discipline', subject: null, body: 'A discipline incident has been recorded for your ward. The class teacher will follow up.' },
    { channel: 'whatsapp', refType: 'leave', subject: null, body: 'Leave request approved. Please ensure your ward returns by 18:00 on the last day.' },
    { channel: 'sms', refType: 'cbt', subject: null, body: 'An online test has been published for your ward. It can be attempted only during school hours.' },
  ];

  const notifyRows: {
    branchId: string; channel: string; recipient: string; subject: string | null;
    body: string; refType: string; refId: string | null; status: string; createdAt: Date;
  }[] = [];
  for (let i = 0; i < 120; i++) {
    const t = notifyTemplates[i % notifyTemplates.length];
    const st = students[i % students.length];
    // Delivery is mocked unless a webhook is configured — say so honestly.
    const roll = rng();
    const status = roll > 0.94 ? 'failed' : roll > 0.72 ? 'sent' : 'mocked';
    const minutesAgo = Math.floor(rng() * 60 * 24 * 26);
    notifyRows.push({
      branchId: BRANCH,
      channel: t.channel,
      recipient: t.channel === 'email' ? (st.id ? `${st.fullName.toLowerCase().replace(/[^a-z]/g, '.')}@example.com` : 'parent@example.com') : `98${String(100000000 + Math.floor(rng() * 89999999)).slice(0, 9)}`,
      subject: t.subject,
      body: t.body,
      refType: t.refType,
      refId: null,
      status,
      createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
    });
  }
  await prisma.notificationLog.createMany({ data: notifyRows });
  const statusTally = notifyRows.reduce<Record<string, number>>((acc, n) => {
    acc[n.status] = (acc[n.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`✓ Notifications: ${notifyRows.length} (${Object.entries(statusTally).map(([k, v]) => `${k}:${v}`).join(', ')})`);

  /* ── Payroll ─────────────────────────────────────────────────── */
  const months: { month: string; status: string; generatedAt: Date }[] = [
    { month: '2026-08', status: 'Paid', generatedAt: new Date(2026, 7, 5) },
    { month: '2026-09', status: 'Paid', generatedAt: new Date(2026, 8, 5) },
    { month: '2026-10', status: 'Generated', generatedAt: new Date(2026, 9, 5) },
  ];

  let payslipCount = 0;
  for (const m of months) {
    for (const s of STAFF) {
      const gross = s.basic + s.hra + s.da;
      const tds = Math.round((gross * s.tds) / 100);
      const epf = Math.round((s.basic * s.epf) / 100);
      const net = gross - tds - epf;
      // A few October payslips are still pending so the payroll screen has work to show.
      const status = m.month === '2026-10'
        ? (['t_sanjay', 't_meenakshi'].includes(s.id) ? 'Draft' : 'Generated')
        : m.status;

      await prisma.payslip.create({
        data: {
          branchId: BRANCH, staffId: s.id, monthYear: m.month,
          basicSalary: s.basic, hra: s.hra, da: s.da, grossSalary: gross,
          tdsDeduction: tds, epfDeduction: epf, otherDeductions: 0,
          netSalary: net, status, generatedAt: m.generatedAt,
        },
      });
      payslipCount += 1;
    }
  }
  const monthlyPayroll = STAFF.reduce((sum, s) => {
    const gross = s.basic + s.hra + s.da;
    return sum + gross - Math.round((gross * s.tds) / 100) - Math.round((s.basic * s.epf) / 100);
  }, 0);
  console.log(`✓ Payroll: ${payslipCount} payslips across ${months.length} months`);

  /* ── Portal logins: parent (two children) + student ──────────── */
  for (const u of DEMO_LOGINS.filter((l) => l.role === 'parent' || l.role === 'student')) {
    await prisma.user.create({
      data: {
        id: u.id, branchId: BRANCH, email: u.email, password: await bcrypt.hash(u.password, 10),
        role: u.role, name: u.name, studentId: u.role === 'student' ? 'stu_001' : null,
      },
    });
  }
  await prisma.parentStudent.createMany({
    data: [
      { branchId: BRANCH, userId: 'u_parent', studentId: 'stu_001', relation: 'Father' },
      { branchId: BRANCH, userId: 'u_parent', studentId: 'stu_004', relation: 'Guardian' },
    ],
  });
  console.log('✓ Portal users: parent (stu_001, stu_004), student (stu_001)');

  /* ── Grade bands (CBSE-style, editable per school) ───────────── */
  const bands = [
    { grade: 'A1', minPercent: 91, gradePoint: 10, remark: 'Outstanding' },
    { grade: 'A2', minPercent: 81, gradePoint: 9, remark: 'Excellent' },
    { grade: 'B1', minPercent: 71, gradePoint: 8, remark: 'Very good' },
    { grade: 'B2', minPercent: 61, gradePoint: 7, remark: 'Good' },
    { grade: 'C1', minPercent: 51, gradePoint: 6, remark: 'Above average' },
    { grade: 'C2', minPercent: 41, gradePoint: 5, remark: 'Average' },
    { grade: 'D', minPercent: 33, gradePoint: 4, remark: 'Pass' },
    { grade: 'E', minPercent: 0, gradePoint: 0, remark: 'Needs improvement' },
  ];
  await prisma.gradeBand.createMany({ data: bands.map((g) => ({ ...g, branchId: BRANCH })) });
  console.log(`✓ Grade bands: ${bands.length}`);

  await seedSecondSchool();

  /* ── Summary ─────────────────────────────────────────────────── */
  console.log('\n✅ Seed complete.');
  console.log(`   Branch            ${BRANCH} — Sainik School`);
  console.log(`   Session           ${SESSION}`);
  console.log(`   Classes           ${CLASSES.length}`);
  console.log(`   Students          ${students.length}`);
  console.log(`   Staff             ${STAFF.length}`);
  console.log(`   Timetable slots   ${slotRows.length}`);
  console.log(`   Attendance rows   ${attendanceRows.length}`);
  console.log(`   Invoices          ${invoiceSeq}`);
  console.log(`   Monthly payroll   ₹${monthlyPayroll.toLocaleString('en-IN')}`);
  console.log('\n   Logins:');
  for (const l of DEMO_LOGINS) console.log(`     ${l.email.padEnd(28)} ${l.password.padEnd(18)} ${l.role}`);
  console.log('     admin@greenfield02.edu       Demo@Green1        branch_admin (second school)');
  console.log('     warden@sainik01.edu     Demo@Warden1');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
