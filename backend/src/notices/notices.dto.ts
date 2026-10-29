import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const NOTICE_AUDIENCES = ['all_students', 'class', 'student'] as const;
export const NOTICE_PRIORITIES = ['normal', 'important'] as const;
export const NOTICE_ALSO_SEND = ['none', 'sms', 'email'] as const;

export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateNoticeDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'title is required' }) @MaxLength(150)
  title!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'body is required' }) @MaxLength(4000)
  body!: string;

  @IsIn(NOTICE_AUDIENCES as unknown as string[], { message: `audience must be one of: ${NOTICE_AUDIENCES.join(', ')}` })
  audience!: NoticeAudience;

  @IsOptional() @IsString() @MaxLength(64)
  class_id?: string;

  @IsOptional() @IsString() @MaxLength(64)
  student_id?: string;

  @IsOptional() @IsIn(NOTICE_PRIORITIES as unknown as string[], { message: 'priority must be normal or important' })
  priority?: (typeof NOTICE_PRIORITIES)[number];

  @IsOptional() @IsDateString({}, { message: 'expires_at must be an ISO date' })
  expires_at?: string;

  @IsOptional() @IsIn(NOTICE_ALSO_SEND as unknown as string[], { message: 'also_send must be none, sms or email' })
  also_send?: (typeof NOTICE_ALSO_SEND)[number];
}
