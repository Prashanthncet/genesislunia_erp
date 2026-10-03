import { Module } from '@nestjs/common';
import { DisciplineController } from './discipline.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DisciplineController],
})
export class DisciplineModule {}
