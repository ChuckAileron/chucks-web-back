import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LaunchBoxMappingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  platformColumn: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  releaseDateColumn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  publisherColumn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  developerColumn?: string;
}

export class LaunchBoxMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  boxartUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  releaseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  developer?: string;
}

export class LaunchBoxRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  platform?: string;

  @IsOptional()
  @IsInt()
  itemId?: number;
}

export class LaunchBoxResultEntryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsInt()
  itemId?: number | null;

  @IsBoolean()
  found: boolean;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  platformLabel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LaunchBoxMetadataDto)
  metadata?: LaunchBoxMetadataDto | null;

  @IsOptional()
  @IsString()
  error?: string;
}

export class SearchSingleDto {
  @IsInt()
  collectionId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  platformColumn: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  platform?: string;
}

export class ApplyOneDto {
  @ValidateNested()
  @Type(() => LaunchBoxMappingDto)
  mapping: LaunchBoxMappingDto;

  @IsInt()
  itemId: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => LaunchBoxMetadataDto)
  metadata?: LaunchBoxMetadataDto | null;
}

export class ParseCsvDto {
  @IsString()
  @IsNotEmpty()
  csvText: string;
}

export class MatchRowsDto {
  @IsInt()
  collectionId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  platformColumn: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => LaunchBoxRowDto)
  rows: LaunchBoxRowDto[];
}

export class BulkSearchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => LaunchBoxRowDto)
  rows: LaunchBoxRowDto[];
}

export class ApplyBulkDto {
  @ValidateNested()
  @Type(() => LaunchBoxMappingDto)
  mapping: LaunchBoxMappingDto;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => LaunchBoxResultEntryDto)
  results: LaunchBoxResultEntryDto[];
}

export class ApplyResultsCsvDto {
  @IsInt()
  collectionId: number;

  @ValidateNested()
  @Type(() => LaunchBoxMappingDto)
  mapping: LaunchBoxMappingDto;

  @IsString()
  @IsNotEmpty()
  csvText: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileName?: string;
}

export class JobParamsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  jobId: string;
}
