import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const LEAVE_TYPES = ['Sick', 'Family', 'Medical', 'Festival', 'Other'] as const;

/** A parent (or the student) asking the school for leave. Status/requester come from the server. */
export class PortalLeaveRequestDto {
  @IsIn(LEAVE_TYPES as unknown as string[], { message: `leave_type must be one of: ${LEAVE_TYPES.join(', ')}` })
  leave_type!: string;

  @Matches(ISO_DATE, { message: 'start_date must be YYYY-MM-DD' })
  start_date!: string;

  @Matches(ISO_DATE, { message: 'end_date must be YYYY-MM-DD' })
  end_date!: string;

  @IsString()
  @IsNotEmpty({ message: 'Please give a reason' })
  @MaxLength(500)
  reason!: string;

  @IsOptional() @IsString() @MaxLength(300)
  remarks?: string;
}
