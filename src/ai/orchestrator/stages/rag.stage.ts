import { Injectable } from '@nestjs/common';
import { ContextEngineService } from '../../../context-engine/context-engine.service';
import { PipelineContext } from '../types/pipeline-context.type';
import { PipelineInput } from '../types/pipeline-input.type';
import { PipelineStage } from '../types/pipeline-stage.type';

@Injectable()
export class RagStage implements PipelineStage {
  readonly name = 'rag';

  constructor(private readonly contextEngine: ContextEngineService) {}

  async execute(ctx: PipelineContext, input: PipelineInput): Promise<void> {
    if (!ctx.knowledgeBaseIds?.length) {
      return;
    }

    const ragBlocks = await this.contextEngine.buildRagBlocks(
      ctx.conversation,
      ctx.messages,
      {
        knowledgeBaseIds: ctx.knowledgeBaseIds,
        currentUser: { userId: input.userId, role: input.role },
        currentUserMessage: ctx.messageContent,
      },
    );

    if (ragBlocks.length === 0) {
      return;
    }

    ctx.ragChunks = [];
    ctx.contextPlan = this.contextEngine.enrichPlan(
      ctx.conversation,
      ctx.contextPlan,
      ragBlocks,
    );
  }
}
