import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
@ApiTags('聊天模块')
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatGateway: ChatGateway) {}

  @Post('push')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '向所有在线 WebSocket 客户端推送消息' })
  push(@Body('content') content: string) {
    this.chatGateway.pushToAll(content);
    return { pushed: content };
  }
}
