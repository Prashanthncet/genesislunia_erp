import { Module } from '@nestjs/common';
import { ReportCacheModule } from '../reports/report-cache.service';
import { ExamsController } from './exams.controller';
import { ReportCardService } from './report-card.service';

@Module({
  imports: [ReportCacheModule],
  controllers: [ExamsController],
  providers: [ReportCardService],
  exports: [ReportCardService],
})
export class ExamsModule {}
