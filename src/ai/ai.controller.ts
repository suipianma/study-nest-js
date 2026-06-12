import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { ChatReply } from './providers/ai.provider';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // Nest SSE 模式：GET /ai/stream?prompt=xxx
  @Sse('stream')
  stream(@Query('prompt') prompt?: string): Observable<MessageEvent> {
    if (!prompt?.trim()) {
      throw new BadRequestException('prompt 不能为空');
    }
    return this.aiService.streamChat(prompt.trim());
  }

  @Post('chat')
  async chat(@Body() body: ChatDto): Promise<ChatReply> {
    return await this.aiService.chat(body.prompt);
  }
}
