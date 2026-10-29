import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export const OPTS = ['A', 'B', 'C', 'D'] as const;

export class CreateQuestionDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  question!: string;

  @IsOptional() @IsIn(['mcq', 'subjective'])
  type?: string;

  @IsOptional() @IsString() @MaxLength(64)
  subject_id?: string;

  @IsOptional() @IsString() @MaxLength(64)
  class_id?: string;

  @IsOptional() @IsString() @MaxLength(500) option_a?: string;
  @IsOptional() @IsString() @MaxLength(500) option_b?: string;
  @IsOptional() @IsString() @MaxLength(500) option_c?: string;
  @IsOptional() @IsString() @MaxLength(500) option_d?: string;

  @IsOptional() @IsIn(OPTS as unknown as string[], { message: 'correct_option must be A, B, C or D' })
  correct_option?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.5) @Max(100)
  marks?: number;
}

export class UpdateQuestionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000)
  question?: string;

  @IsOptional() @IsString() @MaxLength(500) option_a?: string;
  @IsOptional() @IsString() @MaxLength(500) option_b?: string;
  @IsOptional() @IsString() @MaxLength(500) option_c?: string;
  @IsOptional() @IsString() @MaxLength(500) option_d?: string;

  @IsOptional() @IsIn(OPTS as unknown as string[], { message: 'correct_option must be A, B, C or D' })
  correct_option?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.5) @Max(100)
  marks?: number;
}

export class CreateTestDto {
  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsString() @MaxLength(64)
  class_id!: string;

  @IsOptional() @IsString() @MaxLength(64)
  subject_id?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(600)
  duration_min?: number;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true })
  question_ids!: string[];

  /** Scheduled sitting: the window opens here and closes duration_min later. */
  @IsOptional() @IsISO8601()
  starts_at?: string;
}

export class SaveAnswersDto {
  /** `{ questionId: "A".."D" | subjective text | "" (clear) }` — merged into the saved answers. */
  @IsObject()
  answers!: Record<string, unknown>;
}

export class SubmitDto {
  @IsOptional() @IsObject()
  answers?: Record<string, unknown>;
}

export class GradeDto {
  @IsString() @MaxLength(64)
  question_id!: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 })
  marks!: number;
}
