import { Module } from '@nestjs/common';
import { TimetableController } from './timetable.controller';

@Module({
  controllers: [TimetableController],
})
export class TimetableModule {}
