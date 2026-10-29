import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeavesController } from './leaves.controller';
import { GatePassController } from './gate-pass.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [LeavesController, GatePassController],
})
export class LeavesModule {}
