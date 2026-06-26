import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { MemoryScope, MemoryType } from '@prisma/client';

export class CreateMemoryDto {
  @IsEnum(MemoryScope)
  scope: MemoryScope;

  @IsEnum(MemoryType)
  type: MemoryType;

  @IsString()
  @MaxLength(100)
  category: string;

  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  importance?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourceConversationId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourceMessageId?: number;
}
