import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { PaymentsModule } from './payments/payments.module';
import { PortalModule } from './portal/portal.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { RequestContextMiddleware } from './common/request-context';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisModule, RedisService } from './redis/redis.service';
import { JobsModule } from './jobs/jobs.service';
import { AlertingModule } from './common/alerting';
import { TelemetryModule } from './telemetry/telemetry.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Cron jobs (admission reminders, notification retries) — each guarded by JobsService.runOnce.
    ScheduleModule.forRoot(),
    RedisModule,
    // Requests per minute per client IP (see TRUST_PROXY in main.ts for deployments behind a proxy).
    // With REDIS_URL the counters live in Redis, so a limit holds across all API instances
    // instead of being multiplied by the instance count. Evaluated at app creation.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: Number(process.env.GLOBAL_RATE_LIMIT ?? 300) }],
        ...(redis.client ? { storage: new ThrottlerStorageRedisService(redis.client) } : {}),
      }),
    }),
    PrismaModule,
    JobsModule,
    AlertingModule,
    TelemetryModule,
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
    PaymentsModule,
    PortalModule,
    HealthModule,
    AuditModule,
  ],
  providers: [
    // Without this the ThrottlerModule config above was inert: registered but never enforced.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // RequestContext first: it opens the AsyncLocalStorage scope the tenant extension reads.
    consumer.apply(RequestContextMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
