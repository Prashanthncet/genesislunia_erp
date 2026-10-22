import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Leave'] as const;

export class AttendanceEntryDto {
  @IsString() @IsNotEmpty()
  student_id!: string;

  @IsIn(ATTENDANCE_STATUSES as unknown as string[])
  status!: string;
}

/**
 * Bulk roll call for one class on one date. There is deliberately no `marked_by`
 * field: who marked it comes from the logged-in user, and `whitelist: true` strips
 * any value a client still sends.
 */
export class MarkClassAttendanceDto {
  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  // ArrayMaxSize, not MaxLength — MaxLength on an array checks its length and rejects everything.
  @IsArray() @ArrayMinSize(1, { message: 'records must contain at least one entry' })
  @ArrayMaxSize(500, { message: 'Too many attendance records in one request (max 500)' })
  @ValidateNested({ each: true }) @Type(() => AttendanceEntryDto)
  records!: AttendanceEntryDto[];
}

export class NotifyAbsentDto {
  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional() @IsString()
  class_id?: string;
}
