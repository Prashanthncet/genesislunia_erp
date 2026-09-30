import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';

@Module({
  controllers: [ExamsController],
})
export class ExamsModule {}
