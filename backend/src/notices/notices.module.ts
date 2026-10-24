import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  imports: [NotificationsModule],
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
