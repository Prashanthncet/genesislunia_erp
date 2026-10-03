import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  Matches, Max, MaxLength, Min,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INCIDENT_STATUSES = ['Open', 'Under Review', 'Closed'] as const;

/* ── Discipline / safeguarding ──────────────────────────────────── */

export class CreateIncidentDto {
  @IsString() @IsNotEmpty()
  student_id!: string;

  @IsString() @Matches(ISO_DATE, { message: 'incident_date must be YYYY-MM-DD' })
  incident_date!: string;

  // Free text is stored and echoed in the UI, so cap it to stop abuse.
  @IsString() @IsNotEmpty() @MaxLength(2000)
  description!: string;

  @IsOptional() @IsString() @MaxLength(500)
  action_taken?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000)
  demerits?: number;

  // Restricted field: staff with view access must never receive this.
  @IsOptional() @IsString() @MaxLength(2000)
  confidential_notes?: string;
}

export class UpdateIncidentDto {
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(500)
  action_taken?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000)
  demerits?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  confidential_notes?: string;
}

export class IncidentStatusDto {
  @IsIn(INCIDENT_STATUSES as unknown as string[])
  status!: string;
}

/* ── Staff salary & payroll ─────────────────────────────────────── */

const SALARY_MAX = 100_000_000;

export class SalaryStructureDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(SALARY_MAX)
  basic_salary!: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(SALARY_MAX)
  hra?: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(SALARY_MAX)
  da?: number;

  // Percentages: a >100% deduction would produce a negative net salary.
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  tds_percent?: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  epf_percent?: number;
}

export class GeneratePayslipsDto {
  @IsString() @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month!: string;

  @IsOptional() @IsBoolean()
  unpaid_leave_days?: unknown;
}