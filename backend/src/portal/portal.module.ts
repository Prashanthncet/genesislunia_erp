import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';

/** Parent / student portal read models (+ parent leave requests). */
@Module({
  controllers: [PortalController],
})
export class PortalModule {}
