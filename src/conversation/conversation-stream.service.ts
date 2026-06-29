import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Observable,
  Subject,
  catchError,
  finalize,
  of,
  tap,
} from 'rxjs';
import { AgentOrchestratorService } from '../ai/agent/agent-orchestrator.service';
import { AgentContext } from '../ai/agent/agent-context.type';
import { AiService } from '../ai/ai.service';
import { ChatMessage } from '../ai/types/chat-message.type';
import { resolveModelReply } from '../ai/utils/reply.util';
import type { RagCitation } from '../knowledge-base/types/rag.type';
import { ContextPlan } from '../context-engine/types/context-plan.type';
import { ContextTraceStoreService } from '../context-engine/context-trace-store.service';
import { wrapLegacyPayload } from './utils/stream-envelope.util';
import type { StreamEventEnvelope } from './types/stream-event-envelope.type';
import { ContentModerationService } from '../security/content-moderation.service';
import { ConversationService } from './conversation.service';
import { StreamSessionService } from './stream-session.service';
import { SummaryService } from './summary.service';
import { TitleService } from './title.service';
import { StreamSessionSnapshot } from './types/stream-session.type';
import type { StreamSession } from './types/stream-session.type';
import type { ExecutionMode } from '../ai/orchestrator/types/pipeline-context.type';
import { MessageMetadata } from './types/message-metadata.type';

interface StreamGenerationContext {
  streamId: string;
  conversationId: number;
  userId: number;
  userMessageContent: string;
  isFirstAiReply: boolean;
  contextPlan: ContextPlan;
  ollamaMessages: ChatMessage[];
  summary: string | null;
  executionMode: ExecutionMode;
  agentContext: AgentContext;
  ragCitations?: RagCitation[];
  stageTimings?: Record<string, number>;
}

interface StreamPayload {
  thinking?: string;
  response?: string;
  thinkingDelta?: string;
  contentDelta?: string;
  done?: boolean;
  fromCache?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  phase?:
    | 'tool_call'
    | 'tool_result'
    | 'agent_start'
    | 'agent_step'
    | 'agent_done'
    | 'rag_citations';
  tool?: string;
  args?: Record<string, string>;
  result?: string;
  error?: string;
  streamId?: string;
  requestId?: string;
  toolCallId?: string;
  step?: number;
  maxSteps?: number;
  steps?: number;
  seq?: number;
  citations?: RagCitation[];
}

type ProgressPatch = Partial<
  Pick<
    StreamSession,
    'thinking' | 'response' | 'fromCache' | 'promptTokens' | 'completionTokens'
  >
>;

@Injectable()
export class ConversationStreamService {
  private readonly logger = new Logger(ConversationStreamService.name);
  /** 断线续传兜底轮询间隔 */
  private readonly observeFallbackMs = 1000;
  /** Redis 快照节流，供刷新/断线恢复 */
  private readonly redisFlushMs = 120;

  private readonly streamSubjects = new Map<
    string,
    Subject<StreamEventEnvelope | StreamPayload>
  >();
  private readonly generationSubs = new Map<string, { unsubscribe: () => void }>();
  private readonly cancelledStreams = new Set<string>();
  private readonly progressQueues = new Map<string, Promise<void>>();
  private readonly pendingProgress = new Map<string, ProgressPatch>();
  private readonly flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly streamSessionService: StreamSessionService,
    private readonly agentOrchestrator: AgentOrchestratorService,
    private readonly aiService: AiService,
    private readonly conversationService: ConversationService,
    private readonly summaryService: SummaryService,
    private readonly titleService: TitleService,
    private readonly contentModeration: ContentModerationService,
    private readonly contextTraceStore: ContextTraceStoreService,
  ) {}

  observeSession(
    streamId: string,
    conversationId: number,
    userId: number,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      let stopped = false;
      let lastSeq = -1;

      const emitDoneIfNeeded = (payload: StreamPayload) => {
        subscriber.next({
          data: wrapLegacyPayload({ ...payload, streamId }),
        } as MessageEvent);
        if (payload.done || payload.error) {
          stopped = true;
          subscriber.complete();
        }
      };

      const validateSession = async () => {
        const session = await this.streamSessionService.getSession(streamId);
        if (!session) {
          throw new NotFoundException('流会话不存在或已过期');
        }
        if (
          session.conversationId !== conversationId ||
          session.userId !== userId
        ) {
          throw new ForbiddenException('无权访问该流会话');
        }
        return session;
      };

      const emitSnapshotIfNew = (session: {
        streamId: string;
        thinking: string;
        response: string;
        seq: number;
        fromCache: boolean;
        status: string;
        error?: string;
      }) => {
        if (session.seq === lastSeq) {
          return session.status !== 'generating';
        }
        lastSeq = session.seq;
        emitDoneIfNeeded(this.toSsePayload(session));
        return session.status !== 'generating';
      };

      // 实时 token 流：内存 Subject 直推 delta
      const subject = this.getOrCreateSubject(streamId);
      const liveSub = subject.subscribe({
        next: (payload) => {
          if (stopped) return;
          emitDoneIfNeeded(payload);
        },
        error: (err) => {
          if (!stopped) subscriber.error(err);
        },
      });

      void (async () => {
        try {
          const session = await validateSession();
          const finished = emitSnapshotIfNew(session);
          if (finished) {
            this.completeSubject(streamId);
          }
        } catch (err) {
          if (!stopped) subscriber.error(err);
        }
      })();

      // 兜底：Subject 不可用时靠 Redis 感知结束
      const timer = setInterval(() => {
        void (async () => {
          if (stopped) return;
          try {
            const session = await validateSession();
            const finished = emitSnapshotIfNew(session);
            if (finished) {
              this.completeSubject(streamId);
            }
          } catch (err) {
            if (!stopped) subscriber.error(err);
          }
        })();
      }, this.observeFallbackMs);

      return () => {
        stopped = true;
        liveSub.unsubscribe();
        clearInterval(timer);
      };
    });
  }

  /** 用户主动停止：中断后台生成并持久化已输出内容 */
  async cancelGeneration(
    streamId: string,
    conversationId: number,
    userId: number,
  ): Promise<void> {
    const session = await this.streamSessionService.getSession(streamId);
    if (!session) {
      throw new NotFoundException('流会话不存在或已过期');
    }
    if (
      session.conversationId !== conversationId ||
      session.userId !== userId
    ) {
      throw new ForbiddenException('无权访问该流会话');
    }
    if (session.status !== 'generating') {
      return;
    }

    this.cancelledStreams.add(streamId);
    const sub = this.generationSubs.get(streamId);
    if (sub) {
      sub.unsubscribe();
      this.generationSubs.delete(streamId);
      return;
    }

    await this.streamSessionService.markStatus(streamId, 'interrupted');
    this.emitLive(streamId, { streamId, done: true });
    this.completeSubject(streamId);
  }

  /** 后台生成：与 SSE 连接解耦，断线后仍继续写入 Redis 会话。 */
  startDetachedGeneration(context: StreamGenerationContext): void {
    this.getOrCreateSubject(context.streamId);

    const tracePayload = (payload: StreamPayload): StreamPayload => ({
      ...payload,
      streamId: context.streamId,
      requestId: context.contextPlan.requestId,
    });

    // 首帧携带 requestId，供前端 Observability 关联
    this.emitLive(
      context.streamId,
      tracePayload({ streamId: context.streamId }),
    );

    void this.contextTraceStore.save(
      context.userId,
      context.conversationId,
      context.contextPlan,
      { stageTimings: context.stageTimings },
    );

    if (context.ragCitations?.length) {
      this.emitLive(
        context.streamId,
        tracePayload({
          phase: 'rag_citations',
          citations: context.ragCitations,
        }),
      );
    }

    let thinking = '';
    let response = '';
    let fromCache = false;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let finishedNormally = false;
    let endedByError = false;
    const metadata: MessageMetadata = { toolCalls: [], agentSteps: [] };

    const subscription = this.resolveStreamObservable(context)
      .pipe(
        tap((event) => {
          const payload = this.parseStreamPayload(event.data);

          if (payload.phase) {
            this.collectStreamArtifacts(metadata, payload);
            this.emitLive(context.streamId, tracePayload(payload));
            return;
          }

          if (payload.thinkingDelta) thinking += payload.thinkingDelta;
          if (payload.contentDelta) response += payload.contentDelta;
          if (payload.thinking !== undefined) thinking = payload.thinking;
          if (payload.response !== undefined) response = payload.response;
          if (payload.fromCache) fromCache = true;
          if (payload.promptTokens != null) promptTokens = payload.promptTokens;
          if (payload.completionTokens != null) {
            completionTokens = payload.completionTokens;
          }
          if (payload.done) finishedNormally = true;

          this.emitLive(
            context.streamId,
            tracePayload({
              ...payload,
              thinking: payload.thinking ?? thinking,
              response: payload.response ?? response,
              fromCache,
              promptTokens,
              completionTokens,
            }),
          );

          this.scheduleRedisFlush(context.streamId, {
            thinking,
            response,
            fromCache,
            promptTokens,
            completionTokens,
          });
        }),
        catchError((err: unknown) => {
          endedByError = true;
          const message = this.extractStreamErrorMessage(err);
          void this.streamSessionService.markStatus(
            context.streamId,
            'failed',
            message,
          );
          this.emitLive(
            context.streamId,
            tracePayload({
              error: message,
              done: true,
            }),
          );
          this.completeSubject(context.streamId);
          return of({
            data: {
              error: message,
              done: true,
            },
          } as MessageEvent);
        }),
        finalize(() => {
          void this.finalizeGeneration({
            streamId: context.streamId,
            conversationId: context.conversationId,
            userMessageContent: context.userMessageContent,
            isFirstAiReply: context.isFirstAiReply,
            thinking,
            response,
            fromCache,
            promptTokens,
            completionTokens,
            finishedNormally,
            endedByError,
            metadata: this.hasStreamMetadata(metadata) ? metadata : undefined,
          });
        }),
      )
      .subscribe({
        error: () => {
          // finalize 已处理持久化与状态
        },
      });

    this.generationSubs.set(context.streamId, subscription);
  }

  private resolveStreamObservable(
    context: StreamGenerationContext,
  ): Observable<MessageEvent> {
    if (context.executionMode === 'agent') {
      return this.agentOrchestrator.streamWithAgent(
        context.ollamaMessages,
        context.summary,
        context.agentContext,
      );
    }

    return this.aiService.streamChat(context.ollamaMessages, context.summary, {
      skipCache: true,
      model: context.contextPlan.model,
    });
  }

  private async finalizeGeneration(options: {
    streamId: string;
    conversationId: number;
    userMessageContent: string;
    isFirstAiReply: boolean;
    thinking: string;
    response: string;
    fromCache: boolean;
    promptTokens?: number;
    completionTokens?: number;
    finishedNormally: boolean;
    endedByError: boolean;
    metadata?: MessageMetadata;
  }): Promise<void> {
    const wasCancelled = this.cancelledStreams.delete(options.streamId);
    this.generationSubs.delete(options.streamId);

    await this.flushProgressNow(options.streamId);

    const current = await this.streamSessionService.getSession(options.streamId);
    if (!current || current.status !== 'generating') {
      this.completeSubject(options.streamId);
      return;
    }

    const resolved = resolveModelReply(options.thinking, options.response);
    const hasMeaningfulModelOutput = Boolean(
      resolved.response.trim() || resolved.thinking.trim(),
    );

    if (options.endedByError && !hasMeaningfulModelOutput && !wasCancelled) {
      await this.streamSessionService.markStatus(options.streamId, 'failed');
      this.completeSubject(options.streamId);
      return;
    }

    let finalContent: string;
    if (wasCancelled) {
      finalContent = resolved.response
        ? `${resolved.response}[已停止]`
        : '[已停止]';
    } else if (options.finishedNormally) {
      finalContent = resolved.response;
    } else {
      finalContent = resolved.response
        ? `${resolved.response}[回复中断]`
        : '[回复中断]';
    }

    const moderated = this.contentModeration.moderate(finalContent);
    finalContent = moderated.text;

    try {
      await this.conversationService.createAssistantMessage(options.conversationId, {
        content: finalContent,
        thinking: resolved.thinking || undefined,
        fromCache: options.fromCache,
        promptTokens: options.fromCache ? 0 : options.promptTokens,
        completionTokens: options.fromCache ? 0 : options.completionTokens,
        metadata: options.metadata,
      });
      await this.conversationService.touchUpdatedAt(options.conversationId);

      if (
        options.isFirstAiReply &&
        finalContent &&
        !finalContent.endsWith('[回复中断]') &&
        !finalContent.endsWith('[已停止]')
      ) {
        setImmediate(() => {
          void this.titleService.refineTitle(
            options.conversationId,
            options.userMessageContent,
            finalContent,
          );
        });
      }

      this.summaryService.scheduleSummaryUpdate(options.conversationId);
    } catch {
      await this.streamSessionService.markStatus(
        options.streamId,
        'interrupted',
      );
      this.completeSubject(options.streamId);
      return;
    }

    await this.streamSessionService.updateProgress(options.streamId, {
      thinking: resolved.thinking,
      response: finalContent,
      fromCache: options.fromCache,
      promptTokens: options.promptTokens,
      completionTokens: options.completionTokens,
    });
    await this.streamSessionService.markStatus(
      options.streamId,
      wasCancelled ? 'interrupted' : 'completed',
    );

    this.emitLive(options.streamId, {
      streamId: options.streamId,
      thinking: resolved.thinking,
      response: finalContent,
      fromCache: options.fromCache,
      promptTokens: options.promptTokens,
      completionTokens: options.completionTokens,
      done: true,
    });
    this.completeSubject(options.streamId);
  }

  private getOrCreateSubject(
    streamId: string,
  ): Subject<StreamEventEnvelope | StreamPayload> {
    let subject = this.streamSubjects.get(streamId);
    if (!subject || subject.closed) {
      subject = new Subject<StreamPayload>();
      this.streamSubjects.set(streamId, subject);
    }
    return subject;
  }

  private emitLive(streamId: string, payload: StreamPayload): void {
    const subject = this.streamSubjects.get(streamId);
    if (subject && !subject.closed) {
      subject.next(wrapLegacyPayload({ ...payload, streamId }));
    }
  }

  private completeSubject(streamId: string): void {
    const subject = this.streamSubjects.get(streamId);
    if (subject && !subject.closed) {
      subject.complete();
    }
    this.streamSubjects.delete(streamId);

    const timer = this.flushTimers.get(streamId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(streamId);
    }
    this.pendingProgress.delete(streamId);
    this.progressQueues.delete(streamId);
  }

  private scheduleRedisFlush(streamId: string, patch: ProgressPatch): void {
    this.pendingProgress.set(streamId, patch);

    if (this.flushTimers.has(streamId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.flushTimers.delete(streamId);
      const pending = this.pendingProgress.get(streamId);
      if (pending) {
        void this.queueProgressUpdate(streamId, pending);
      }
    }, this.redisFlushMs);
    this.flushTimers.set(streamId, timer);
  }

  private async flushProgressNow(streamId: string): Promise<void> {
    const timer = this.flushTimers.get(streamId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(streamId);
    }

    const pending = this.pendingProgress.get(streamId);
    if (!pending) {
      return;
    }

    await this.queueProgressUpdate(streamId, pending);
  }

  private queueProgressUpdate(
    streamId: string,
    patch: ProgressPatch,
  ): Promise<void> {
    const prev = this.progressQueues.get(streamId) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        await this.streamSessionService.updateProgress(streamId, patch);
      })
      .catch(async (err) => {
        this.logger.warn(
          `Redis 流进度写入失败，将重试一次 streamId=${streamId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await this.streamSessionService.updateProgress(streamId, patch);
      })
      .catch((err) => {
        this.logger.error(
          `Redis 流进度写入重试仍失败 streamId=${streamId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    this.progressQueues.set(streamId, next);
    return next;
  }

  private toSsePayload(session: {
    streamId: string;
    thinking: string;
    response: string;
    seq: number;
    fromCache: boolean;
    status: string;
    error?: string;
  }): StreamPayload {
    const resolved = resolveModelReply(session.thinking, session.response);
    return {
      streamId: session.streamId,
      seq: session.seq,
      thinking: resolved.thinking,
      response: resolved.response,
      fromCache: session.fromCache,
      error: session.error,
      done: session.status !== 'generating',
    };
  }

  toPublicSnapshot(
    session: NonNullable<Awaited<ReturnType<StreamSessionService['getSession']>>>,
  ): StreamSessionSnapshot {
    return this.streamSessionService.toSnapshot(session);
  }

  private parseStreamPayload(data: unknown): StreamPayload {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as StreamPayload;
      } catch {
        return { response: data };
      }
    }
    if (data && typeof data === 'object') {
      return data as StreamPayload;
    }
    return {};
  }

  private extractStreamErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return 'AI 服务异常，请稍后重试';
  }

  private collectStreamArtifacts(
    metadata: MessageMetadata,
    payload: StreamPayload,
  ): void {
    if (!metadata.toolCalls) metadata.toolCalls = [];
    if (!metadata.agentSteps) metadata.agentSteps = [];

    if (payload.phase === 'agent_start') {
      metadata.agentSteps.push({
        type: 'start',
        maxSteps: payload.maxSteps,
      });
      return;
    }

    if (payload.phase === 'agent_step') {
      metadata.agentSteps.push({
        type: 'step',
        step: payload.step,
        maxSteps: payload.maxSteps,
      });
      return;
    }

    if (payload.phase === 'agent_done') {
      metadata.agentSteps.push({
        type: 'done',
        totalSteps: payload.steps,
      });
      return;
    }

    if (payload.phase === 'tool_call' && payload.tool && payload.args) {
      metadata.toolCalls.push({
        tool: payload.tool,
        args: payload.args,
        status: 'calling',
        toolCallId: payload.toolCallId,
      });
      return;
    }

    if (payload.phase === 'tool_result' && payload.tool) {
      const item = [...metadata.toolCalls]
        .reverse()
        .find(
          (call) =>
            call.tool === payload.tool &&
            call.status === 'calling' &&
            (payload.toolCallId == null ||
              call.toolCallId === payload.toolCallId),
        );
      if (item) {
        item.status = payload.error ? 'error' : 'done';
        item.result = payload.result;
      }
      return;
    }

    if (payload.phase === 'rag_citations' && payload.citations?.length) {
      metadata.citations = payload.citations.map((item) => ({
        chunkId: item.chunkId,
        documentName: item.documentName,
        page: item.page,
        snippet: item.snippet,
        score: item.score,
      }));
    }
  }

  private hasStreamMetadata(metadata: MessageMetadata): boolean {
    return (
      (metadata.toolCalls?.length ?? 0) > 0 ||
      (metadata.agentSteps?.length ?? 0) > 0 ||
      (metadata.citations?.length ?? 0) > 0
    );
  }
}
