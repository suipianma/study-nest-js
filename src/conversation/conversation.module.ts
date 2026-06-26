import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ContextEngineModule } from '../context-engine/context-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { SecurityModule } from '../security/security.module';
import { ConversationController } from './conversation.controller';
import { ConversationStreamService } from './conversation-stream.service';
import { ConversationService } from './conversation.service';
import { StreamSessionService } from './stream-session.service';
import { SummaryService } from './summary.service';
import { TitleService } from './title.service';
import { JwtQueryGuard } from './guards/jwt-query.guard';

@Module({
  imports: [PrismaModule, RedisModule, AiModule, ContextEngineModule, SecurityModule],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    ConversationStreamService,
    StreamSessionService,
    SummaryService,
    TitleService,
    JwtQueryGuard,
  ],
})
export class ConversationModule {}
