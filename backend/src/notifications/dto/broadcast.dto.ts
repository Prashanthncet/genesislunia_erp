import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const CHANNELS = ['email', 'sms', 'whatsapp'] as const;
export const AUDIENCES = ['all_students', 'all_staff', 'class', 'custom'] as const;

export class BroadcastDto {
  @IsIn(CHANNELS as unknown as string[], { message: `channel must be one of: ${CHANNELS.join(', ')}` })
  channel!: (typeof CHANNELS)[number];

  @IsOptional() @IsString() @MaxLength(150)
  subject?: string;

  @IsString() @IsNotEmpty({ message: 'body is required' }) @MaxLength(2000)
  body!: string;

  @IsIn(AUDIENCES as unknown as string[], { message: `audience must be one of: ${AUDIENCES.join(', ')}` })
  audience!: (typeof AUDIENCES)[number];

  @IsOptional() @IsString()
  class_id?: string;

  /** Array, or a comma / newline / semicolon separated string. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string'
    ? value.split(/[,\n;]+/).map((r: string) => r.trim()).filter(Boolean)
    : value))
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) @MaxLength(254, { each: true })
  recipients?: string[];
}
