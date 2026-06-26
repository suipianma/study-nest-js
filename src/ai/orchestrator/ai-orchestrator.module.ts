import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai.module';
import { ContextEngineModule } from '../../context-engine/context-engine.module';
import { ConversationModule } from '../../conversation/conversation.module';
import { SecurityModule } from '../../security/security.module';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { ContextStage } from './stages/context.stage';
import { InputStage } from './stages/input.stage';
import { PromptStage } from './stages/prompt.stage';
import { RagStage } from './stages/rag.stage';
import { StreamStage } from './stages/stream.stage';
import { ToolStage } from './stages/tool.stage';

@Module({
  imports: [
    AiModule,
    ContextEngineModule,
    SecurityModule,
    forwardRef(() => ConversationModule),
  ],
  providers: [
    AiOrchestratorService,
    InputStage,
    ContextStage,
    PromptStage,
    RagStage,
    ToolStage,
    StreamStage,
  ],
  exports: [AiOrchestratorService],
})
export class AiOrchestratorModule {}
