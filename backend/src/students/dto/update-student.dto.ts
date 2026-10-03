import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

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
  @IsIn(['Active', 'Inactive', 'Alumni', 'Transferred'])
  status?: string;

  @IsOptional()
  @IsString()
  enrollment_date?: string;
}
