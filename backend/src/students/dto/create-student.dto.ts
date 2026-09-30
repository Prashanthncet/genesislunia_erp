import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  admission_no!: string;

  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsOptional()
  @IsString()
  father_name?: string;

  @IsOptional()
  @IsString()
  mobile_number?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsIn(['Male', 'Female', 'Other'])
  gender!: string;

  @IsString()
  @IsNotEmpty()
  class_id!: string;

  @IsOptional()
  @IsString()
  roll_no?: string;

  @IsOptional()
  @IsString()
  enrollment_date?: string;
}
