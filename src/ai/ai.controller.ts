import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { ChatReply } from './providers/ai.provider';
import { PromptTemplateService } from './prompt-template.service';

@ApiTags('AI模块')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly promptTemplateService: PromptTemplateService,
  ) {}

  @Get('prompts')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '获取 Prompt 模板列表' })
  listPrompts() {
    return this.promptTemplateService.findAll();
  }

  @Post('chat')
  @UseGuards(AuthGuard('jwt'))
  async chat(@Body() body: ChatDto): Promise<ChatReply> {
    return await this.aiService.chat([
      { role: 'user', content: body.prompt },
    ]);
  }
}
