import { Module } from '@nestjs/common';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsPublicController } from './admissions-public.controller';
import { AdmissionsService } from './admissions.service';
import { AdmissionRemindersService } from './admission-reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [NotificationsModule, PaymentsModule, StorageModule],
  // Public controller first: its literal "public/..." routes must win over ":id".
  controllers: [AdmissionsPublicController, AdmissionsController],
  providers: [AdmissionsService, AdmissionRemindersService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
