import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^\d{2}:\d{2}$/;
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export class CreateTeacherDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(300)
  subjects?: string;

  @IsOptional() @IsInt() @Min(0) @Max(12)
  max_periods_per_day?: number;
}

export class UpdateTeacherDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(300)
  subjects?: string;

  @IsOptional() @IsInt() @Min(0) @Max(12)
  max_periods_per_day?: number;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}

export class RoomDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  name!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  type!: string;

  @IsOptional() @IsInt() @Min(1) @Max(2000)
  capacity?: number;
}

export class UpdateRoomDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80)
  name?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40)
  type?: string;

  @IsOptional() @IsInt() @Min(1) @Max(2000)
  capacity?: number;
}

export class PeriodDto {
  @IsInt() @Min(1) @Max(20)
  period_number!: number;

  @IsString() @Matches(HH_MM, { message: 'start_time must be HH:MM' })
  start_time!: string;

  @IsString() @Matches(HH_MM, { message: 'end_time must be HH:MM' })
  end_time!: string;

  @IsOptional() @IsBoolean()
  is_break?: boolean;

  @IsOptional() @IsString() @MaxLength(60)
  break_name?: string;
}

export class SavePeriodsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => PeriodDto)
  periods!: PeriodDto[];
}

export class ScheduleExamDto {
  @IsString() @IsNotEmpty()
  exam_id!: string;

  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsInt() @Min(1) @Max(20)
  period_number!: number;

  @IsOptional() @IsString()
  room_id?: string;

  @IsOptional() @IsString()
  invigilator_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  subject!: string;
}

export class TeacherAbsentDto {
  @IsString() @Matches(ISO_DATE, { message: 'date is required (YYYY-MM-DD)' })
  date!: string;

  @IsOptional() @IsString() @MaxLength(200)
  reason?: string;
}

export class UpsertSlotDto {
  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsIn(WEEK_DAYS)
  day_of_week!: string;

  @IsInt() @Min(1) @Max(20)
  period_number!: number;

  @IsString() @IsNotEmpty() @MaxLength(80)
  subject!: string;

  @IsString() @IsNotEmpty()
  teacher_id!: string;

  @IsOptional() @IsString()
  room_id?: string;
}

/** Admin cover for one period. Omit `substitute_teacher_id` to auto-pick the least-loaded free teacher. */
export class SubstituteDto {
  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsInt() @Min(1) @Max(20)
  period_number!: number;

  @IsOptional() @IsString()
  original_teacher_id?: string;

  @IsOptional() @IsString()
  substitute_teacher_id?: string;

  @IsOptional() @IsString() @MaxLength(200)
  reason?: string;
}

/** Teacher/HOD asks for cover; an admin assigns it later. */
export class SubstitutionRequestDto {
  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsInt() @Min(1) @Max(20)
  period_number!: number;

  @IsString() @IsNotEmpty() @MaxLength(200)
  reason!: string;
}

export class AssignSubstitutionDto {
  @IsOptional() @IsString()
  substitute_teacher_id?: string;
}

export class GenerateSubjectDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  name!: string;

  @IsString() @IsNotEmpty()
  teacher_id!: string;

  @IsInt() @Min(0) @Max(60)
  periods_per_week!: number;

  @IsOptional() @IsString()
  room_id?: string;

  @IsOptional() @IsBoolean()
  double_periods?: boolean;
}

export class GenerateDto {
  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsInt() @Min(1) @Max(12)
  periods_per_day!: number;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsIn(WEEK_DAYS, { each: true })
  working_days!: string[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30)
  @ValidateNested({ each: true }) @Type(() => GenerateSubjectDto)
  subjects!: GenerateSubjectDto[];

  @IsOptional() @IsBoolean()
  overwrite?: boolean;
}
