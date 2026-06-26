import { Injectable } from '@nestjs/common';
import { ContextEngineService } from '../../../context-engine/context-engine.service';
import { PipelineContext } from '../types/pipeline-context.type';
import { PipelineInput } from '../types/pipeline-input.type';
import { PipelineStage } from '../types/pipeline-stage.type';

@Injectable()
export class PromptStage implements PipelineStage {
  readonly name = 'prompt';

  constructor(private readonly contextEngine: ContextEngineService) {}

  async execute(ctx: PipelineContext, _input: PipelineInput): Promise<void> {
    if (!ctx.usePrompt || !ctx.promptId) {
      return;
    }

    const promptBlock = this.contextEngine.buildPromptBlock(
      ctx.conversation,
      ctx.messages,
      ctx.promptId,
    );
    if (!promptBlock) {
      return;
    }

    ctx.contextPlan = this.contextEngine.enrichPlan(
      ctx.conversation,
      ctx.contextPlan,
      [promptBlock],
    );
  }
}
