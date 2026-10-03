import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AcademicsController } from './academics.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [AcademicsController],
})
export class AcademicsModule {}
