import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ContextComposerService } from './context-composer.service';
import { ContextEngineService } from './context-engine.service';
import { ContextMemoryService } from './context-memory.service';
import { ContextMemoryController } from './context-memory.controller';
import { ContextPruningService } from './context-pruning.service';
import { ContextTraceService } from './context-trace.service';
import { ContextTraceStoreService } from './context-trace-store.service';
import { TokenBudgetManager } from './token-budget.manager';

@Module({
  imports: [
    forwardRef(() => AiModule),
    KnowledgeBaseModule,
    PrismaModule,
    RedisModule,
  ],
  controllers: [ContextMemoryController],
  providers: [
    TokenBudgetManager,
    ContextPruningService,
    ContextTraceService,
    ContextTraceStoreService,
    ContextMemoryService,
    ContextComposerService,
    ContextEngineService,
  ],
  exports: [
    ContextEngineService,
    ContextComposerService,
    ContextMemoryService,
    ContextTraceStoreService,
  ],
})
export class ContextEngineModule {}
