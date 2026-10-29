import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimetableController } from './timetable.controller';
import { SubstitutionService } from './substitution.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TimetableController],
  providers: [SubstitutionService],
})
export class TimetableModule {}
