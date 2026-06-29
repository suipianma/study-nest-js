import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConversationStreamService } from '../../../conversation/conversation-stream.service';
import { RetrievalService } from '../../../knowledge-base/retrieval.service';
import { StreamSessionService } from '../../../conversation/stream-session.service';
import { PipelineContext } from '../types/pipeline-context.type';
import { PipelineInput } from '../types/pipeline-input.type';
import { PipelineStage } from '../types/pipeline-stage.type';

@Injectable()
export class StreamStage implements PipelineStage {
  readonly name = 'stream';

  constructor(
    private readonly streamSessionService: StreamSessionService,
    private readonly conversationStreamService: ConversationStreamService,
    private readonly retrievalService: RetrievalService,
  ) {}

  async execute(ctx: PipelineContext, input: PipelineInput): Promise<void> {
    const session = await this.streamSessionService.createSession({
      conversationId: input.conversationId,
      userId: input.userId,
      userMessageContent: ctx.messageContent,
      isFirstAiReply: ctx.isFirstAiReply,
    });

    ctx.streamId = session.streamId;

    this.conversationStreamService.startDetachedGeneration({
      streamId: session.streamId,
      conversationId: input.conversationId,
      userId: input.userId,
      userMessageContent: ctx.messageContent,
      isFirstAiReply: ctx.isFirstAiReply,
      contextPlan: ctx.contextPlan,
      ollamaMessages: ctx.ollamaMessages,
      summary: ctx.summary,
      executionMode: ctx.executionMode,
      agentContext: ctx.agentContext,
      ragCitations: this.retrievalService.toCitations(ctx.ragChunks),
      stageTimings: { ...ctx.stageTimings },
    });
  }

  observe(
    ctx: PipelineContext,
    input: PipelineInput,
  ): Observable<MessageEvent> {
    return this.conversationStreamService.observeSession(
      ctx.streamId,
      input.conversationId,
      input.userId,
    );
  }
}
