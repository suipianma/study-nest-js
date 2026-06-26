import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MemoryScope, MemoryType } from '@prisma/client';

export class SearchMemoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  query?: string;

  @IsOptional()
  @IsEnum(MemoryScope)
  scope?: MemoryScope;

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  conversationId?: number;
}
