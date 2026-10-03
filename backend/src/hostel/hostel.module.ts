import { Module } from '@nestjs/common';
import { HostelController } from './hostel.controller';

@Module({
  controllers: [HostelController],
})
export class HostelModule {}
