import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

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
  mother_name?: string;

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
  house?: string;

  @IsOptional()
  @IsString()
  blood_group?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  enrollment_date?: string;
}

export class BulkCreateStudentsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'students must contain at least one student row' })
  @ArrayMaxSize(500, { message: 'Maximum 500 students per bulk upload' })
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  students!: CreateStudentDto[];
}
