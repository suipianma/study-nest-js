import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ContextComposerService } from './context-composer.service';
import { ContextEngineService } from './context-engine.service';
import { ContextMemoryService } from './context-memory.service';
import { ContextMemoryController } from './context-memory.controller';
import { ContextPruningService } from './context-pruning.service';
import { ContextTraceService } from './context-trace.service';
import { TokenBudgetManager } from './token-budget.manager';

@Module({
  imports: [forwardRef(() => AiModule), KnowledgeBaseModule, PrismaModule],
  controllers: [ContextMemoryController],
  providers: [
    TokenBudgetManager,
    ContextPruningService,
    ContextTraceService,
    ContextMemoryService,
    ContextComposerService,
    ContextEngineService,
  ],
  exports: [ContextEngineService, ContextComposerService, ContextMemoryService],
})
export class ContextEngineModule {}
