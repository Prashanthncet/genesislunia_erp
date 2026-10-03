import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(160)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  // bcrypt silently ignores anything past 72 bytes, so cap it rather than accept junk.
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  password!: string;
}