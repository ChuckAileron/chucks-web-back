import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

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
