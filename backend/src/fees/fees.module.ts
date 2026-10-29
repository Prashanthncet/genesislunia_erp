import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FeesController } from './fees.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [FeesController],
})
export class FeesModule {}
