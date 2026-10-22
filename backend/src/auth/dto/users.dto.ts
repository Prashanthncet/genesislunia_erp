import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ALL_ROLES } from '../roles';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const STRONG_MSG = 'Password must contain an uppercase letter, a lowercase letter and a number';

export class CreateUserDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(STRONG, { message: STRONG_MSG })
  password!: string;

  @IsIn(ALL_ROLES, { message: `role must be one of: ${ALL_ROLES.join(', ')}` })
  role!: string;

  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString()
  staff_id?: string;

  /** role=student: the student this login belongs to. */
  @IsOptional() @IsString()
  student_id?: string;

  /** role=parent: the children this parent may see. */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true })
  child_ids?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(ALL_ROLES, { message: `role must be one of: ${ALL_ROLES.join(', ')}` })
  role?: string;

  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  /** Admin password reset; forces a change at next login. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) @Matches(STRONG, { message: STRONG_MSG })
  password?: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(72)
  current_password!: string;

  @IsString() @MinLength(8) @MaxLength(72) @Matches(STRONG, { message: STRONG_MSG })
  new_password!: string;
}
