import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
  ValidateNested,
} from 'class-validator';

const SALARY_MAX = 10_000_000;
const PHONE = /^[0-9+\-\s()]{6,20}$/;

export class CreateStaffDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'A valid email is required' }) @MaxLength(160)
  email!: string;

  /** Designation (free text, e.g. "Teacher", "Warden"); the login role lives on User. */
  @IsOptional() @IsString() @MaxLength(80)
  role?: string;

  @IsOptional() @IsString() @MaxLength(80)
  department?: string;

  @IsOptional() @IsString() @Matches(PHONE, { message: 'phone must be a phone number' })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  subjects?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(12)
  max_periods_per_day?: number;
}

export class UpdateStaffDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @IsOptional() @IsEmail() @MaxLength(160)
  email?: string;

  @IsOptional() @IsString() @MaxLength(80)
  role?: string;

  @IsOptional() @IsString() @MaxLength(80)
  department?: string;

  /** Empty string clears the phone. */
  @IsOptional() @IsString() @Matches(/^$|^[0-9+\-\s()]{6,20}$/, { message: 'phone must be a phone number' })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  subjects?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(12)
  max_periods_per_day?: number;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}

export class SalaryStructureDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(SALARY_MAX)
  basic_salary!: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(SALARY_MAX)
  hra?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(SALARY_MAX)
  da?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  tds_percent?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  epf_percent?: number;

  /**
   * 'slab' = Indian income-tax slabs (payroll-tax.ts); 'flat' = legacy tds_percent.
   * When omitted on a request that sends tds_percent, 'flat' is assumed (old API behaviour).
   */
  @IsOptional() @IsIn(['slab', 'flat'])
  tax_mode?: 'slab' | 'flat';

  @IsOptional() @IsIn(['new', 'old'])
  tax_regime?: 'new' | 'old';

  /** Old regime only: annual deductions the employee declared (80C, 80D …). */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(SALARY_MAX)
  annual_deductions?: number;
}

export class PtSlabDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(SALARY_MAX)
  min!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(SALARY_MAX)
  max?: number | null;

  @Type(() => Number) @IsNumber() @Min(0) @Max(2500)
  amount!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2500)
  februaryAmount?: number;
}

export class PayrollConfigDto {
  @IsOptional() @IsIn(['none', 'karnataka', 'maharashtra', 'custom'])
  professional_tax_preset?: 'none' | 'karnataka' | 'maharashtra' | 'custom';

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => PtSlabDto)
  professional_tax_slabs?: PtSlabDto[];

  /** null / 0 clears the ceiling. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000)
  epf_wage_ceiling?: number | null;

  /** Advanced: per-school override of the FY slabs (validated in payroll-tax.ts). */
  @IsOptional() @IsObject()
  tax_overrides?: Record<string, unknown>;
}

export class TaxPreviewDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(SALARY_MAX)
  monthly_gross!: number;

  @IsOptional() @IsIn(['new', 'old'])
  tax_regime?: 'new' | 'old';

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(SALARY_MAX)
  annual_deductions?: number;
}

export class GeneratePayslipsDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month!: string;

  /**
   * Optional per-staff override `{ staffId: days }`. Values are checked in the controller
   * (0..days-in-month, halves allowed, staff must belong to this school).
   */
  @IsOptional() @IsObject()
  unpaid_leave_days?: Record<string, unknown>;

  /** Create the run as Draft (reviewable, recomputed on re-run) instead of Generated. */
  @IsOptional() @IsBoolean()
  as_draft?: boolean;
}

export class FinalizePayslipsDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month!: string;
}
