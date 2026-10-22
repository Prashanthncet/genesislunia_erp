import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClassDto {
  @IsString() @IsNotEmpty() @MaxLength(40)
  name!: string;

  @IsOptional() @IsString() @MaxLength(10)
  section?: string;

  /** Staff id of the class teacher (active, same school). */
  @IsOptional() @IsString() @MaxLength(64)
  class_teacher_id?: string;
}

export class UpdateClassDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40)
  name?: string;

  @IsOptional() @IsString() @MaxLength(10)
  section?: string;

  /** Staff id of the class teacher; empty string clears it. */
  @IsOptional() @IsString() @MaxLength(64)
  class_teacher_id?: string;
}
