import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtUser } from '../knowledge-base/knowledge-base.service';
import { ContextMemoryService } from './context-memory.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { SearchMemoryDto } from './dto/search-memory.dto';

@Controller('memories')
@ApiTags('记忆模块')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@SkipThrottle()
export class ContextMemoryController {
  constructor(private readonly contextMemoryService: ContextMemoryService) {}

  @Post()
  @ApiOperation({ summary: '创建记忆' })
  create(
    @Body() dto: CreateMemoryDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.contextMemoryService.createMemory(dto, req.user);
  }

  @Get()
  @ApiOperation({ summary: '检索可访问记忆' })
  search(
    @Query() dto: SearchMemoryDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.contextMemoryService.searchMemories(dto, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: '遗忘记忆' })
  forget(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.contextMemoryService.forgetMemory(+id, req.user);
  }
}
