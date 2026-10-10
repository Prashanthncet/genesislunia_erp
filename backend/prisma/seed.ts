import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding mock data...');

  // Get or create branch
  let branch = await prisma.branch.findFirst({ where: { id: 'sainik01' } });
  if (!branch) {
    branch = await prisma.branch.upsert({
      where: { id: 'sainik01' },
      create: {
        id: 'sainik01',
        name: 'Sainik School',
        location: 'New Delhi, India',
      },
      update: {},
    });
    console.log('✓ Created/ensured branch sainik01');
  }

  // Clear existing data - delete in correct dependency order
  console.log('🧹 Clearing existing data...');
  
  // 1. Delete payslips (references staff)
  await prisma.payslip.deleteMany({ where: { branchId: branch.id } });
  
  // 2. Delete staff leaves (references staff)
  await prisma.staffLeave.deleteMany({ where: { branchId: branch.id } });
  
  // 3. Delete users (references staff via staffId)
  await prisma.user.deleteMany({ where: { branchId: branch.id } });
  
  // 4. Delete salary structures (references staff)
  await prisma.salaryStructure.deleteMany({ where: { staff: { branchId: branch.id } } });
  
  // 5. Delete timetable slots (references staff as teacher)
  await prisma.timetableSlot.deleteMany({ where: { branchId: branch.id } });
  
  // 6. Delete substitutions (references staff)
  await prisma.substitution.deleteMany({ where: { branchId: branch.id } });
  
  // 7. Delete lesson plans (references staff as teacher)
  await prisma.lessonPlan.deleteMany({ where: { branchId: branch.id } });
  
  // 8. Delete assignments (references staff as teacher)
  await prisma.assignment.deleteMany({ where: { branchId: branch.id } });
  
  // 9. Delete incidents (references staff as reporter)
  await prisma.incident.deleteMany({ where: { branchId: branch.id } });
  
  // 10. Delete hostels (references staff as warden)
  await prisma.hostel.deleteMany({ where: { branchId: branch.id } });
  
  // 11. Delete offline payments (references staff as collector)
  await prisma.offlinePayment.deleteMany({ where: { branchId: branch.id } });
  
  // 12. Delete exam schedules (references staff as invigilator)
  await prisma.examSchedule.deleteMany({ where: { branchId: branch.id } });
  
  // 13. Finally delete staff
  await prisma.staff.deleteMany({ where: { branchId: branch.id } });
  
  console.log('✓ Cleared all existing data');

  const staffData = [
    { name: 'Col. Rajesh Sharma', email: 'rajesh.sharma@sainik01.edu', role: 'Principal', subjects: '', maxPeriods: 0, salary: { basicSalary: 120000, hra: 48000, da: 15000, tdsPercent: 10, epfPercent: 0 } },
    { name: 'Ms. Priya Menon', email: 'priya.menon@sainik01.edu', role: 'Vice Principal', subjects: 'English', maxPeriods: 4, salary: { basicSalary: 90000, hra: 36000, da: 11250, tdsPercent: 10, epfPercent: 12 } },
    { name: 'Mr. Arjun Singh', email: 'arjun.singh@sainik01.edu', role: 'Teacher', subjects: 'Mathematics, NDA Mathematics', maxPeriods: 6, salary: { basicSalary: 55000, hra: 22000, da: 6875, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Sneha Iyer', email: 'sneha.iyer@sainik01.edu', role: 'Teacher', subjects: 'Physics, Chemistry', maxPeriods: 6, salary: { basicSalary: 52000, hra: 20800, da: 6500, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Vikram Malhotra', email: 'vikram.m@sainik01.edu', role: 'Teacher', subjects: 'English, Communication Skills', maxPeriods: 6, salary: { basicSalary: 48000, hra: 19200, da: 6000, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Anjali Verma', email: 'anjali.verma@sainik01.edu', role: 'Teacher', subjects: 'Hindi, Sanskrit', maxPeriods: 6, salary: { basicSalary: 45000, hra: 18000, da: 5625, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Deepak Kumar', email: 'deepak.kumar@sainik01.edu', role: 'Teacher', subjects: 'Physical Drill, Sports', maxPeriods: 8, salary: { basicSalary: 50000, hra: 20000, da: 6250, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Kavita Joshi', email: 'kavita.joshi@sainik01.edu', role: 'Teacher', subjects: 'History, Geography, Political Science', maxPeriods: 6, salary: { basicSalary: 47000, hra: 18800, da: 5875, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Ramesh Patel', email: 'ramesh.patel@sainik01.edu', role: 'Teacher', subjects: 'Computer Science, I.T.', maxPeriods: 6, salary: { basicSalary: 58000, hra: 23200, da: 7250, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Neha Agarwal', email: 'neha.agarwal@sainik01.edu', role: 'Teacher', subjects: 'Chemistry, Laboratory', maxPeriods: 6, salary: { basicSalary: 53000, hra: 21200, da: 6625, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Sanjay Bansal', email: 'sanjay.bansal@sainik01.edu', role: 'Accountant', subjects: '', maxPeriods: 0, salary: { basicSalary: 40000, hra: 16000, da: 5000, tdsPercent: 10, epfPercent: 12 } },
    { name: 'Mrs. Meenakshi Rao', email: 'meenakshi.rao@sainik01.edu', role: 'Librarian', subjects: '', maxPeriods: 0, salary: { basicSalary: 35000, hra: 14000, da: 4375, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Amit Khanna', email: 'amit.khanna@sainik01.edu', role: 'Warden', subjects: '', maxPeriods: 4, salary: { basicSalary: 55000, hra: 22000, da: 6875, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Pooja Sharma', email: 'pooja.sharma@sainik01.edu', role: 'Teacher', subjects: 'Biology, Zoology, Botany', maxPeriods: 6, salary: { basicSalary: 51000, hra: 20400, da: 6375, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Harish Chandra', email: 'harish.chandra@sainik01.edu', role: 'Teacher', subjects: 'Physics, NDA Physics', maxPeriods: 6, salary: { basicSalary: 54000, hra: 21600, da: 6750, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Divya Singh', email: 'divya.singh@sainik01.edu', role: 'Teacher', subjects: 'Mathematics', maxPeriods: 6, salary: { basicSalary: 46000, hra: 18400, da: 5750, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Naveen Kumar', email: 'naveen.kumar@sainik01.edu', role: 'Teacher', subjects: 'English Literature', maxPeriods: 6, salary: { basicSalary: 49000, hra: 19600, da: 6125, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Rekha Pandey', email: 'rekha.pandey@sainik01.edu', role: 'Teacher', subjects: 'Hindi, Literature', maxPeriods: 6, salary: { basicSalary: 44000, hra: 17600, da: 5500, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mr. Sunil Yadav', email: 'sunil.yadav@sainik01.edu', role: 'Teacher', subjects: 'Sports, Drill', maxPeriods: 8, salary: { basicSalary: 47000, hra: 18800, da: 5875, tdsPercent: 5, epfPercent: 12 } },
    { name: 'Mrs. Sangeeta Mishra', email: 'sangeeta.m@sainik01.edu', role: 'Teacher', subjects: 'Civics, Economics', maxPeriods: 6, salary: { basicSalary: 48000, hra: 19200, da: 6000, tdsPercent: 5, epfPercent: 12 } },
  ];

  const createdStaff: { id: string; name: string; salary: any }[] = [];

  // Create staff members
  for (const s of staffData) {
    const staff = await prisma.staff.create({
      data: {
        branchId: branch.id,
        name: s.name,
        email: s.email,
        role: s.role,
        subjects: s.subjects || null,
        maxPeriodsPerDay: s.maxPeriods,
        isActive: true,
      },
    });

    // Create salary structure
    await prisma.salaryStructure.create({
      data: {
        staffId: staff.id,
        basicSalary: s.salary.basicSalary,
        hra: s.salary.hra,
        da: s.salary.da,
        tdsPercent: s.salary.tdsPercent,
        epfPercent: s.salary.epfPercent,
      },
    });

    createdStaff.push({ id: staff.id, name: s.name, salary: s.salary });
    console.log(`✓ Created staff: ${s.name}`);
  }

  // Create default demo users with bcrypt passwords
  const usersToSeed = [
    { email: 'principal@sainik01.edu', password: 'Demo@Principal1', role: 'branch_admin' },
    { email: 'admin@sainik01.edu', password: 'Admin@123', role: 'super_admin' },
    { email: 'teacher@sainik01.edu', password: 'Demo@Teacher1', role: 'teacher' },
    { email: 'warden@sainik01.edu', password: 'Demo@Warden1', role: 'warden' },
  ];

  for (const u of usersToSeed) {
    const hashedPassword = await bcrypt.hash(u.password, 10);
    const existingStaff = createdStaff.find((s) => s.name.toLowerCase().includes(u.role.replace('_', '')));
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        password: hashedPassword,
        role: u.role,
        branchId: branch.id,
        staffId: existingStaff?.id ?? null,
      },
      update: {
        password: hashedPassword,
        role: u.role,
        branchId: branch.id,
      },
    });
    console.log(`✓ Created/updated user: ${u.email} (${u.role})`);
  }

  // Generate payslips for Oct 2026
  console.log('\n📄 Generating payslips for October 2026...');
  
  const monthYear = '2026-10';
  const generatedAt = new Date();

  for (const staff of createdStaff) {
    const gross = staff.salary.basicSalary + staff.salary.hra + staff.salary.da;
    const tds = Math.round((gross * staff.salary.tdsPercent) / 100);
    const epf = Math.round((staff.salary.basicSalary * staff.salary.epfPercent) / 100);
    const netSalary = gross - tds - epf;

    // Random status for variety
    const statuses = ['Paid', 'Paid', 'Processed', 'Pending', 'Paid'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    await prisma.payslip.create({
      data: {
        branchId: branch.id,
        staffId: staff.id,
        monthYear: monthYear,
        basicSalary: staff.salary.basicSalary,
        hra: staff.salary.hra,
        da: staff.salary.da,
        grossSalary: gross,
        tdsDeduction: tds,
        epfDeduction: epf,
        otherDeductions: 0,
        netSalary: Math.round(netSalary),
        status: randomStatus,
        generatedAt: generatedAt,
      },
    });

    console.log(`  ✓ ${staff.name}: ${monthYear} - ₹${netSalary.toLocaleString('en-IN')} (${randomStatus})`);
  }

  // Generate payslips for September 2026 (previous month, all paid)
  console.log('\n📄 Generating payslips for September 2026...');
  
  for (const staff of createdStaff) {
    const gross = staff.salary.basicSalary + staff.salary.hra + staff.salary.da;
    const tds = Math.round((gross * staff.salary.tdsPercent) / 100);
    const epf = Math.round((staff.salary.basicSalary * staff.salary.epfPercent) / 100);
    const netSalary = gross - tds - epf;

    await prisma.payslip.create({
      data: {
        branchId: branch.id,
        staffId: staff.id,
        monthYear: '2026-09',
        basicSalary: staff.salary.basicSalary,
        hra: staff.salary.hra,
        da: staff.salary.da,
        grossSalary: gross,
        tdsDeduction: tds,
        epfDeduction: epf,
        otherDeductions: 0,
        netSalary: Math.round(netSalary),
        status: 'Paid',
        generatedAt: new Date(2026, 8, 5),
      },
    });
  }
  console.log('  ✓ September 2026 payslips generated (all paid)');

  // Add sample staff leaves
  console.log('\n📅 Adding sample staff leaves...');
  await prisma.staffLeave.createMany({
    data: [
      {
        branchId: branch.id,
        staffId: createdStaff[2].id, // Arjun Singh
        leaveType: 'Casual',
        startDate: '2026-10-10',
        endDate: '2026-10-11',
        reason: 'Family event',
        status: 'Approved',
      },
      {
        branchId: branch.id,
        staffId: createdStaff[4].id, // Vikram Malhotra
        leaveType: 'Sick',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        reason: 'Medical appointment',
        status: 'Approved',
      },
      {
        branchId: branch.id,
        staffId: createdStaff[6].id, // Deepak Kumar
        leaveType: 'Casual',
        startDate: '2026-10-20',
        endDate: '2026-10-20',
        reason: 'Personal work',
        status: 'Pending',
      },
    ],
  });
  console.log('✓ Sample leaves added');

  const totalPayroll = createdStaff.reduce((sum, staff) => {
    const gross = staff.salary.basicSalary + staff.salary.hra + staff.salary.da;
    const tds = Math.round((gross * staff.salary.tdsPercent) / 100);
    const epf = Math.round((staff.salary.basicSalary * staff.salary.epfPercent) / 100);
    return sum + (gross - tds - epf);
  }, 0);

  console.log('\n✅ Seed completed successfully!');
  console.log(`   Total Staff: ${createdStaff.length}`);
  console.log(`   Total Payslips (Oct 2026): ${createdStaff.length}`);
  console.log(`   Total Payslips (Sep 2026): ${createdStaff.length}`);
  console.log(`   Monthly Payroll Cost: ₹${totalPayroll.toLocaleString('en-IN')}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
