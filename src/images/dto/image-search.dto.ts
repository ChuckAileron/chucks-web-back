import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IMAGE_ENGINES } from '../../common/image-search.js';

export class ImageSearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query: string;

  @IsOptional()
  @IsIn(IMAGE_ENGINES)
  engine?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  page?: number;
}
