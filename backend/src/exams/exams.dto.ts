import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACADEMIC_YEAR = /^\d{4}(-(\d{2}|\d{4}))?$/;

export class CreateExamDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional() @IsString() @MaxLength(64)
  class_id?: string;

  @IsOptional() @IsString() @MaxLength(40)
  term?: string;

  @IsOptional() @IsString() @Matches(ACADEMIC_YEAR, { message: 'academic_year must look like 2026-27' })
  academic_year?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(100)
  weight?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1000)
  max_marks?: number;
}

export class UpdateExamDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional() @IsString() @MaxLength(64)
  class_id?: string;

  @IsOptional() @IsString() @MaxLength(40)
  term?: string;

  @IsOptional() @IsString() @Matches(ACADEMIC_YEAR, { message: 'academic_year must look like 2026-27' })
  academic_year?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(100)
  weight?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1000)
  max_marks?: number;
}

export class MarkEntryDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  student_id!: string;

  /** Optional per row; defaults to the request's subject_id. */
  @IsOptional() @IsString() @MaxLength(64)
  subject_id?: string;

  @Type(() => Number) @IsNumber({}, { message: 'score must be a number' }) @Min(0, { message: 'score cannot be negative' })
  score!: number;

  /** Accepted for backwards compatibility and ignored: the exam's max_marks is authoritative. */
  @IsOptional() @Type(() => Number) @IsNumber()
  max_score?: number;
}

export class BulkMarksDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  exam_id!: string;

  @IsOptional() @IsString() @MaxLength(64)
  subject_id?: string;

  /** Required when the exam itself is not tied to a class. */
  @IsOptional() @IsString() @MaxLength(64)
  class_id?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => MarkEntryDto)
  marks!: MarkEntryDto[];
}

export class GradeBandDto {
  @IsString() @IsNotEmpty() @MaxLength(8)
  grade!: string;

  @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  min_percent!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  grade_point?: number;

  @IsOptional() @IsString() @MaxLength(80)
  remark?: string;
}

export class UpdateGradeBandDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(8)
  grade?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  min_percent?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  grade_point?: number;

  @IsOptional() @IsString() @MaxLength(80)
  remark?: string;
}

export class ReplaceGradeBandsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => GradeBandDto)
  bands!: GradeBandDto[];
}

export class PublishReportCardsDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  class_id!: string;

  @IsString() @Matches(ACADEMIC_YEAR, { message: 'academic_year must look like 2026-27' })
  academic_year!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  term!: string;

  /** Required to replace cards that were already published for this term. */
  @IsOptional() @IsBoolean()
  confirm?: boolean;
}
