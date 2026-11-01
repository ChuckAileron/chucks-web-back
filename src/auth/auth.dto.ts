import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CredentialsDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class PasswordResetRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
