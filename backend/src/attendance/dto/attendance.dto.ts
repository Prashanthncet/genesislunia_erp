import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { ATTENDANCE_STATUSES } from '../attendance-math';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export { ATTENDANCE_STATUSES };

export class AttendanceEntryDto {
  @IsString() @IsNotEmpty()
  student_id!: string;

  @IsIn(ATTENDANCE_STATUSES as unknown as string[], { message: `status must be one of ${ATTENDANCE_STATUSES.join(', ')}` })
  status!: string;

  /**
   * Why the student is On Duty (sports meet, NCC camp, school event…). REQUIRED for OD,
   * optional remark for every other status. Stored in AttendanceRecord.note.
   */
  @ValidateIf((o: AttendanceEntryDto) => o.status === 'OD' || (o.reason !== undefined && o.reason !== null))
  @IsString({ message: 'reason is required for OD (On Duty)' })
  @Matches(/\S/, { message: 'reason is required for OD (On Duty)' })
  @MaxLength(300)
  reason?: string;
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
