import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const branchId = 'sainik01';

  await prisma.branch.upsert({
    where: { id: branchId },
    update: {},
    create: { id: branchId, name: 'Sainik School', location: 'Bengaluru' },
  });

  // Classes
  const classes = [
    { id: 'cls_10a', name: 'Class 10', section: 'A' },
    { id: 'cls_10b', name: 'Class 10', section: 'B' },
    { id: 'cls_12_sci', name: 'Class 12', section: 'Science' },
  ];
  for (const c of classes) {
    await prisma.class.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, branchId },
    });
  }

  // Staff / teachers
  const teachers = [
    { id: 't_rajesh', name: 'Col. Rajesh Sharma', email: 'rajesh@sainik01.edu', subjects: 'English' },
    { id: 't_meera', name: 'Mrs. Meera Iyer', email: 'meera@sainik01.edu', subjects: 'Maths' },
    { id: 't_arjun', name: 'Mr. Arjun Rao', email: 'arjun@sainik01.edu', subjects: 'Physics' },
    { id: 't_kavya', name: 'Ms. Kavya Nair', email: 'kavya@sainik01.edu', subjects: 'Chemistry' },
  ];
  for (const t of teachers) {
    await prisma.staff.upsert({
      where: { branchId_email: { branchId, email: t.email } },
      update: {},
      create: { ...t, branchId, role: 'Teacher', isActive: true },
    });
  }

  // Users
  const users = [
    { id: 'u_admin', email: 'admin@sainik01.edu', role: 'super_admin', password: 'Admin@123' },
    { id: 'u_principal', email: 'principal@sainik01.edu', role: 'branch_admin', password: 'Demo@Principal1' },
    { id: 'u_teacher', email: 'teacher@sainik01.edu', role: 'teacher', password: 'Demo@Teacher1', staffId: 't_rajesh' },
    { id: 'u_warden', email: 'warden@sainik01.edu', role: 'warden', password: 'Demo@Warden1' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash },
      create: {
        id: u.id,
        branchId,
        email: u.email,
        password: hash,
        role: u.role,
        staffId: u.staffId ?? null,
      },
    });
  }

  // Students
  const students = [
    { id: 'stu_001', admissionNo: 'S2023-045', fullName: 'Aditya Vardhan Singh', classId: 'cls_10a', gender: 'Male' },
    { id: 'stu_002', admissionNo: 'S2023-046', fullName: 'Rahul Verma', classId: 'cls_10a', gender: 'Male' },
    { id: 'stu_003', admissionNo: 'S2023-047', fullName: 'Priya Menon', classId: 'cls_10a', gender: 'Female' },
    { id: 'stu_004', admissionNo: 'S2023-048', fullName: 'Vikram Malhotra', classId: 'cls_10b', gender: 'Male' },
  ];
  for (const s of students) {
    await prisma.student.upsert({
      where: { branchId_admissionNo: { branchId, admissionNo: s.admissionNo } },
      update: {},
      create: { ...s, branchId },
    });
  }

  // Subjects (CBSE levels)
  const subjects = [
    { id: 'sub_eng', name: 'English', code: 'ENG', level: 'Class 6-8', groupId: 1 },
    { id: 'sub_hin', name: 'Hindi', code: 'HIN', level: 'Class 6-8', groupId: 1 },
    { id: 'sub_mat', name: 'Mathematics', code: 'MAT', level: 'Class 9-10', groupId: 1 },
    { id: 'sub_sci', name: 'Science', code: 'SCI', level: 'Class 9-10', groupId: 2 },
    { id: 'sub_sst', name: 'Social Studies', code: 'SST', level: 'Class 9-10', groupId: 2 },
  ];
  for (const s of subjects) {
    await prisma.subject.upsert({
      where: { branchId_code: { branchId, code: s.code } },
      update: {},
      create: { ...s, branchId },
    });
  }

  // Exams
  const exams = [
    { id: 'ex_1', name: 'Mid-Term Examinations 2026', date: '2026-07-20', classId: 'cls_10a' },
    { id: 'ex_2', name: 'Final CBSE Examinations 2026', date: '2026-07-25', classId: 'cls_10a' },
  ];
  for (const e of exams) {
    await prisma.exam.upsert({
      where: { id: e.id },
      update: {},
      create: { ...e, branchId },
    });
  }

  // Sample exam marks for stu_001
  const marks = [
    { id: 'mk_1', examId: 'ex_1', studentId: 'stu_001', subjectId: 'sub_mat', score: 78, maxScore: 100 },
    { id: 'mk_2', examId: 'ex_1', studentId: 'stu_001', subjectId: 'sub_sci', score: 85, maxScore: 100 },
  ];
  for (const m of marks) {
    await prisma.examMark.upsert({
      where: {
        examId_studentId_subjectId: {
          examId: m.examId,
          studentId: m.studentId,
          subjectId: m.subjectId,
        },
      },
      update: { score: m.score },
      create: { ...m, branchId },
    });
  }

  // Rooms
  const rooms = [
    { id: 'room_101', name: 'Room 101', type: 'Classroom' },
    { id: 'room_102', name: 'Room 102', type: 'Classroom' },
    { id: 'lab_402', name: 'Lab 402', type: 'Lab' },
  ];
  for (const r of rooms) {
    await prisma.academicRoom.upsert({
      where: { id: r.id },
      update: {},
      create: { ...r, branchId, capacity: 40 },
    });
  }

  // Period configs
  const periods = [
    { periodNumber: 1, startTime: '08:00', endTime: '08:45' },
    { periodNumber: 2, startTime: '08:45', endTime: '09:30' },
    { periodNumber: 3, startTime: '09:30', endTime: '10:15', isBreak: true, breakName: 'Short Break' },
    { periodNumber: 4, startTime: '10:45', endTime: '11:30' },
    { periodNumber: 5, startTime: '11:30', endTime: '12:15' },
    { periodNumber: 6, startTime: '13:00', endTime: '13:45' },
  ];
  const existingPeriods = await prisma.periodConfig.count({ where: { branchId } });
  if (existingPeriods === 0) {
    for (const p of periods) {
      await prisma.periodConfig.create({ data: { ...p, branchId } });
    }
  }

  // Base timetable for Class 10 A (Mon only, 3 periods) so demo views are not empty
  const tt = [
    { id: 'tt_1', classId: 'cls_10a', dayOfWeek: 'Mon', periodNumber: 1, subject: 'Mathematics', teacherId: 't_meera', roomId: 'room_101' },
    { id: 'tt_2', classId: 'cls_10a', dayOfWeek: 'Mon', periodNumber: 2, subject: 'English', teacherId: 't_rajesh', roomId: 'room_101' },
    { id: 'tt_3', classId: 'cls_10a', dayOfWeek: 'Mon', periodNumber: 4, subject: 'Physics', teacherId: 't_arjun', roomId: 'lab_402' },
  ];
  for (const slot of tt) {
    await prisma.timetableSlot.upsert({
      where: {
        classId_dayOfWeek_periodNumber: {
          classId: slot.classId,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
        },
      },
      update: {},
      create: { ...slot, branchId },
    });
  }

  // eslint-disable-next-line no-console
  console.log('✅ Seed complete: branch, classes, staff, users, students, subjects, exams, rooms, periods, timetable');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
