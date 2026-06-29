import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConversationStreamService } from '../../conversation/conversation-stream.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { createEmptyPipelineContext } from './types/pipeline-context.type';
import { PipelineInput } from './types/pipeline-input.type';
import { ContextStage } from './stages/context.stage';
import { InputStage } from './stages/input.stage';
import { PromptStage } from './stages/prompt.stage';
import { RagStage } from './stages/rag.stage';
import { StreamStage } from './stages/stream.stage';
import { ToolStage } from './stages/tool.stage';

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly inputStage: InputStage,
    private readonly contextStage: ContextStage,
    private readonly promptStage: PromptStage,
    private readonly ragStage: RagStage,
    private readonly toolStage: ToolStage,
    private readonly streamStage: StreamStage,
    private readonly conversationStreamService: ConversationStreamService,
    private readonly metrics: MetricsService,
  ) {}

  private get stages() {
    return [
      this.inputStage,
      this.contextStage,
      this.promptStage,
      this.ragStage,
      this.toolStage,
      this.streamStage,
    ];
  }

  async run(input: PipelineInput): Promise<Observable<MessageEvent>> {
    const ctx = createEmptyPipelineContext();

    for (const stage of this.stages) {
      const startedAt = Date.now();
      await stage.execute(ctx, input);
      ctx.stageTimings[stage.name] = Date.now() - startedAt;
      this.metrics.observe(`pipeline_stage_ms_${stage.name}`, ctx.stageTimings[stage.name]);
    }

    this.metrics.increment('pipeline_runs_total');

    this.logger.debug(
      `Pipeline timings ms: ${JSON.stringify(ctx.stageTimings)}`,
    );

    return this.streamStage.observe(ctx, input);
  }

  resume(
    conversationId: number,
    userId: number,
    streamId: string,
  ): Observable<MessageEvent> {
    return this.conversationStreamService.observeSession(
      streamId,
      conversationId,
      userId,
    );
  }
}
