import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ContextBuilderService } from './context-builder.service';
import { SummaryService } from './summary.service';
import { TitleService } from './title.service';
import { JwtQueryGuard } from './guards/jwt-query.guard';

@Module({
  imports: [PrismaModule, AiModule, KnowledgeBaseModule],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    ContextBuilderService,
    SummaryService,
    TitleService,
    JwtQueryGuard,
  ],
})
export class ConversationModule {}
