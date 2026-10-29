import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const ROLL_SESSIONS = ['Morning', 'Night'] as const;
export const ROLL_STATUSES = ['Present', 'Absent', 'On Leave'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateHostelDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  /** Legacy/informational. The real capacity is the sum of room capacities. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5000)
  capacity?: number;

  @IsOptional() @IsString() @MaxLength(64)
  warden_id?: string;
}

export class UpdateHostelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5000)
  capacity?: number;

  /** Empty string clears the warden. */
  @IsOptional() @IsString() @MaxLength(64)
  warden_id?: string;
}

export class CreateRoomDto {
  @IsString() @MaxLength(64)
  hostel_id!: string;

  @IsString() @MinLength(1) @MaxLength(40)
  room_number!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(50)
  capacity!: number;
}

export class UpdateRoomDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40)
  room_number?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  capacity?: number;
}

export class AllocateDto {
  @IsString() @MaxLength(64)
  student_id!: string;

  @IsString() @MaxLength(64)
  room_id!: string;

  /** Optional bed by label (B1, B2 …); the first free active bed is used when no bed is given. */
  @IsOptional() @IsString() @Matches(/^B\d{1,3}$/, { message: 'bed_label must look like B1' })
  bed_label?: string;

  /** Optional bed by id (from the bed map); wins over bed_label. */
  @IsOptional() @IsString() @MaxLength(64)
  bed_id?: string;
}

export class BedStatusDto {
  @IsBoolean()
  is_active!: boolean;

  /** Why the bed is going out of service (kept in the audit log). */
  @IsOptional() @IsString() @MaxLength(200)
  reason?: string;
}

export class AutoAllocateDto {
  @IsString() @MaxLength(64)
  student_id!: string;

  /** Restrict auto-assign to one hostel. */
  @IsOptional() @IsString() @MaxLength(64)
  hostel_id?: string;
}

export class RollCallEntryDto {
  @IsString() @MaxLength(64)
  student_id!: string;

  @IsIn(ROLL_STATUSES as unknown as string[])
  status!: string;
}

export class RollCallDto {
  @IsString() @MaxLength(64)
  hostel_id!: string;

  @Matches(DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsIn(ROLL_SESSIONS as unknown as string[])
  session!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => RollCallEntryDto)
  entries!: RollCallEntryDto[];
}

export class VisitorDto {
  @IsOptional() @IsString() @MaxLength(64)
  hostel_id?: string;

  @IsString() @MinLength(1) @MaxLength(120)
  visitor_name!: string;

  @IsOptional() @IsString() @Matches(/^[0-9+\-\s]{6,20}$/, { message: 'visitor_phone must be a phone number' })
  visitor_phone?: string;

  @IsString() @MinLength(1) @MaxLength(160)
  whom_to_meet!: string;

  @IsOptional() @IsString() @MaxLength(300)
  purpose?: string;

  /** Base64 data URL image captured by the warden/security desk for the visitor log. */
  @IsOptional()
  @IsString()
  @MaxLength(2_800_000)
  @Matches(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/, {
    message: 'visitor_photo must be a base64 data URL image (JPEG, PNG, or WebP)',
  })
  visitor_photo?: string;
}
