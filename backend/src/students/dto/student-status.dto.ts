import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Lifecycle statuses. Students are never hard-deleted once they have history — they become Inactive / Left. */
export const STUDENT_STATUSES = ['Active', 'Inactive', 'Left', 'Alumni', 'Transferred'];

export class StudentStatusDto {
  @IsIn(STUDENT_STATUSES)
  status!: string;

  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
