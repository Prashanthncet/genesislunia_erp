import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const LESSON_STATUSES = ['Planned', 'In Progress', 'Completed'] as const;

export class CreateSubjectDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(12) code!: string;
  @IsOptional() @IsString() @MaxLength(40) level?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) group_id?: number;
}

export class UpdateSubjectDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(12) code?: string;
  @IsOptional() @IsString() @MaxLength(40) level?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) group_id?: number;
}

export class CreateSyllabusDto {
  @IsString() @IsNotEmpty() @MaxLength(64) class_id!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) subject_id!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class UpdateSyllabusDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class CreateLessonPlanDto {
  @IsString() @IsNotEmpty() @MaxLength(64) syllabus_id!: string;
  /** Teachers: omit (or pass their own id). Admins/HOD: required unless they have a staff row. */
  @IsOptional() @IsString() @MaxLength(64) teacher_id?: string;
  @IsString() @IsNotEmpty() @MaxLength(300) topic!: string;
  @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' }) date!: string;
  @IsOptional() @IsIn(LESSON_STATUSES as unknown as string[]) status?: string;
}

export class UpdateLessonPlanDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) topic?: string;
  @IsOptional() @IsString() @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' }) date?: string;
  @IsOptional() @IsIn(LESSON_STATUSES as unknown as string[]) status?: string;
}

export class LessonStatusDto {
  @IsIn(LESSON_STATUSES as unknown as string[], { message: `status must be one of ${LESSON_STATUSES.join(', ')}` })
  status!: string;
}

export class CreateAssignmentDto {
  @IsString() @IsNotEmpty() @MaxLength(64) class_id!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) subject_id!: string;
  @IsOptional() @IsString() @MaxLength(64) teacher_id?: string;
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @Matches(ISO_DATE, { message: 'due_date must be YYYY-MM-DD' }) due_date!: string;
}

export class UpdateAssignmentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @Matches(ISO_DATE, { message: 'due_date must be YYYY-MM-DD' }) due_date?: string;
}
