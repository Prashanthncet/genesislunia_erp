import { Module } from '@nestjs/common';
import { CbtController } from './cbt.controller';

@Module({
  controllers: [CbtController],
})
export class CbtModule {}
