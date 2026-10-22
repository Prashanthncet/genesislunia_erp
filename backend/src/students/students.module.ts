import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { StudentsController } from './students.controller';

@Module({
  imports: [StorageModule],
  controllers: [StudentsController],
})
export class StudentsModule {}
