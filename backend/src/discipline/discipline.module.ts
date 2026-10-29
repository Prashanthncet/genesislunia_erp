import { Module } from '@nestjs/common';
import { DisciplineController } from './discipline.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SafeguardingAccess } from './safeguarding-access';

@Module({
  imports: [NotificationsModule],
  controllers: [DisciplineController],
  providers: [SafeguardingAccess],
  exports: [SafeguardingAccess],
})
export class DisciplineModule {}
