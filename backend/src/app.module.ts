import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { ClassesModule } from './classes/classes.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ExamsModule } from './exams/exams.module';
import { TimetableModule } from './timetable/timetable.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AcademicsModule } from './academics/academics.module';
import { FeesModule } from './fees/fees.module';
import { HostelModule } from './hostel/hostel.module';
import { DisciplineModule } from './discipline/discipline.module';
import { StaffModule } from './staff/staff.module';
import { LeavesModule } from './leaves/leaves.module';
import { ReportsModule } from './reports/reports.module';
import { CbtModule } from './cbt/cbt.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    StudentsModule,
    ClassesModule,
    AttendanceModule,
    ExamsModule,
    TimetableModule,
    AdmissionsModule,
    NotificationsModule,
    AcademicsModule,
    FeesModule,
    HostelModule,
    DisciplineModule,
    StaffModule,
    LeavesModule,
    ReportsModule,
    CbtModule,
  ],
  providers: [
    // Without this the ThrottlerModule config above was inert: registered but never enforced.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
