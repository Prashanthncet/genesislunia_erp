import { Module } from '@nestjs/common';
import { AdmissionsController } from './admissions.controller';

@Module({
  controllers: [AdmissionsController],
})
export class AdmissionsModule {}
