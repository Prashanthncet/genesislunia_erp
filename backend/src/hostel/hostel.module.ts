import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HostelController } from './hostel.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [HostelController],
})
export class HostelModule {}
