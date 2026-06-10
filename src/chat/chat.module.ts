import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WsJwtGuard } from '../common/guards/ws-jwt.guard';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatGateway, WsJwtGuard],
})
export class ChatModule {}
