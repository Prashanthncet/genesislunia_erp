import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Gate-pass times are local "YYYY-MM-DDTHH:mm[:ss]" strings (no zone), as the UI's datetime-local sends them.
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/* ── Staff leave ─────────────────────────────────────────────────── */

export class CreateStaffLeaveDto {
  /** Only HR / admins may file on behalf of someone else; everyone else files for themselves. */
  @IsOptional() @IsString() @MaxLength(64)
  staff_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  leave_type!: string;

  @IsString() @Matches(ISO_DATE, { message: 'start_date must be YYYY-MM-DD' })
  start_date!: string;

  @IsString() @Matches(ISO_DATE, { message: 'end_date must be YYYY-MM-DD' })
  end_date!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class LeaveDecisionDto {
  @IsIn(['Approved', 'Rejected'], { message: "decision must be 'Approved' or 'Rejected'" })
  decision!: 'Approved' | 'Rejected';

  @IsOptional() @IsString() @MaxLength(500)
  remarks?: string;
}

/* ── Student leave ───────────────────────────────────────────────── */

export class CreateStudentLeaveDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  student_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  leave_type!: string;

  @IsString() @Matches(ISO_DATE, { message: 'start_date must be YYYY-MM-DD' })
  start_date!: string;

  @IsString() @Matches(ISO_DATE, { message: 'end_date must be YYYY-MM-DD' })
  end_date!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

/* ── Gate pass ───────────────────────────────────────────────────── */

export class CreateGatePassDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  student_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  type!: string;

  @IsString() @IsNotEmpty() @MaxLength(500)
  reason!: string;

  @IsString() @Matches(LOCAL_DATETIME, { message: 'out_time must be YYYY-MM-DDTHH:mm' })
  out_time!: string;

  @IsOptional() @IsString() @Matches(LOCAL_DATETIME, { message: 'expected_in_time must be YYYY-MM-DDTHH:mm' })
  expected_in_time?: string;
}

export class RejectGatePassDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  reason!: string;
}

export class GatePassOtpDto {
  @IsString() @Matches(/^\d{6}$/, { message: 'otp must be 6 digits' })
  otp!: string;
}
