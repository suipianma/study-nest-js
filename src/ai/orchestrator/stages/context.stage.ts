import { Injectable } from '@nestjs/common';
import { ContextEngineService } from '../../../context-engine/context-engine.service';
import { PipelineContext } from '../types/pipeline-context.type';
import { PipelineInput } from '../types/pipeline-input.type';
import { PipelineStage } from '../types/pipeline-stage.type';

@Injectable()
export class ContextStage implements PipelineStage {
  readonly name = 'context';

  constructor(private readonly contextEngine: ContextEngineService) {}

  async execute(ctx: PipelineContext, input: PipelineInput): Promise<void> {
    ctx.contextPlan = await this.contextEngine.buildPlan(
      ctx.conversation,
      ctx.messages,
      {
        skipPrompt: true,
        skipRag: true,
        currentUserMessage: ctx.messageContent,
        currentUser: { userId: input.userId, role: input.role },
      },
    );
  }
}
