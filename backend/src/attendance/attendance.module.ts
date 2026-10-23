import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceController } from './attendance.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [AttendanceController],
})
export class AttendanceModule {}
