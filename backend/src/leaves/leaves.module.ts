import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeavesController } from './leaves.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [LeavesController],
})
export class LeavesModule {}
