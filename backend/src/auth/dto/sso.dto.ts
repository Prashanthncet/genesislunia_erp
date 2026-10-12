import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class SsoDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(160)
  email!: string;
}
