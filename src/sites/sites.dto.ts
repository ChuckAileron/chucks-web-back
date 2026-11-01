import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSiteContextDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class CreateSitePageDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  url!: string;
}
