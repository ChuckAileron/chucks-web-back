import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUppercase,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateShopContextDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class AddShopLinksDto {
  @IsString()
  @MaxLength(100_000)
  text!: string;
}

export class UpdateShopItemDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000_000)
  manualPrice?: number | null;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsUppercase()
  manualCurrency?: string | null;
}

export const SHOP_SORTS = [
  'name-asc',
  'name-desc',
  'price-asc',
  'price-desc',
  'date-asc',
  'date-desc',
] as const;

export class ShopSortDto {
  @IsIn(SHOP_SORTS)
  sort!: (typeof SHOP_SORTS)[number];
}
