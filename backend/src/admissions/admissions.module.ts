import { Module } from '@nestjs/common';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsPublicController } from './admissions-public.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AdmissionsController, AdmissionsPublicController],
})
export class AdmissionsModule {}
