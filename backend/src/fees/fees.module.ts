import { Module } from '@nestjs/common';
import { FeesController } from './fees.controller';

@Module({
  controllers: [FeesController],
})
export class FeesModule {}
