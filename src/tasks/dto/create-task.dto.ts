import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  project?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  due?: string;
}
