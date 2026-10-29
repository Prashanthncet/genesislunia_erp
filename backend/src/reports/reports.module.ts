import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { ReportCacheModule } from './report-cache.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ExamsModule, ReportCacheModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
