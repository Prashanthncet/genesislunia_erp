import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { EmployeesController } from './employees.controller';

@Module({
  controllers: [StaffController, EmployeesController],
})
export class StaffModule {}
