import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWishlistItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  manufacturer?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(9999)
  year?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;
}

export class UpdateWishlistItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  manufacturer?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(9999)
  year?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;
}

export class CreateWishlistPriceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  store?: string;
}
