import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { ChatReply } from './providers/ai.provider';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() body: ChatDto): Promise<ChatReply> {
    return await this.aiService.chat([
      { role: 'user', content: body.prompt },
    ]);
  }
}
