import { Module } from '@nestjs/common';
import { NotificationRetryJob } from './notification-retry.job';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationRetryJob],
  exports: [NotificationsService],
})
export class NotificationsModule {}
