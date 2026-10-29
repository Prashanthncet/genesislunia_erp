import { IsEmail, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';
import { STUDENT_STATUSES } from './student-status.dto';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  father_name?: string;

  @IsOptional()
  @IsString()
  mother_name?: string;

  @IsOptional()
  @IsString()
  mobile_number?: string;

  @IsOptional()
  @ValidateIf((o) => o.email !== '' && o.email !== null && o.email !== undefined)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['Male', 'Female', 'Other'])
  gender?: string;

  @IsOptional()
  @IsString()
  blood_group?: string;

  @IsOptional()
  @IsString()
  class_id?: string;

  @IsOptional()
  @IsString()
  roll_no?: string;

  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  enrollment_date?: string;
}
