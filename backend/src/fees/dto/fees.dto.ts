import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional,
  IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_MAX = 100_000_000;

export class CreateFeeStructureDto {
  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(60)
  fee_type!: string;

  // Money must be non-negative and bounded — a negative fee would corrupt collections.
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MONEY_MAX)
  amount!: number;
}

export class UpdateFeeStructureDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(60)
  fee_type?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MONEY_MAX)
  amount?: number;
}

export class CreateInvoiceDto {
  @IsString() @IsNotEmpty()
  student_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  term!: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MONEY_MAX)
  total_amount!: number;

  @IsString() @Matches(ISO_DATE, { message: 'due_date must be YYYY-MM-DD' })
  due_date!: string;
}

export class GenerateInvoicesDto {
  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  term!: string;

  @IsString() @Matches(ISO_DATE, { message: 'due_date must be YYYY-MM-DD' })
  due_date!: string;
}

export class CreatePaymentDto {
  @IsString() @IsNotEmpty()
  invoice_id!: string;

  // Never negative: a negative payment is a refund and needs a different flow.
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MONEY_MAX)
  amount_paid!: number;

  @IsIn(['Cash', 'Cheque', 'UPI', 'Bank Transfer', 'Card', 'Demand Draft'])
  payment_mode!: string;

  @IsOptional() @IsString() @MaxLength(80)
  reference_no?: string;

  @IsOptional() @IsString() @Matches(ISO_DATE, { message: 'payment_date must be YYYY-MM-DD' })
  payment_date?: string;
}

/* ── Attendance ───────────────────────────────────────────────── */

export class AttendanceRecordDto {
  @IsString() @IsNotEmpty()
  student_id!: string;

  @IsIn(['Present', 'Absent', 'Late'])
  status!: string;
}

export class MarkAttendanceDto {
  @IsString() @IsNotEmpty()
  class_id!: string;

  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  // Bounded so one request cannot be used to hammer the DB with a huge insert.
  // NOTE: ArrayMaxSize, not MaxLength — MaxLength on an array checks its length and
  // would reject every payload.
  @IsArray() @ArrayMinSize(1, { message: 'records must contain at least one entry' })
  @ArrayMaxSize(500, { message: 'Too many attendance records in one request (max 500)' })
  @ValidateNested({ each: true }) @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];

  @IsOptional() @IsString()
  marked_by?: string;
}