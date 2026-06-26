import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { AiService } from '../ai.service';
import { ChatMessage } from '../types/chat-message.type';
import { resolveModelReply } from '../utils/reply.util';
import { ContextComposerService } from '../../context-engine/context-composer.service';
import { ContextEngineService } from '../../context-engine/context-engine.service';
import { ContextPlan } from '../../context-engine/types/context-plan.type';
import { ToolCallParserService } from './tool-call-parser.service';
import { ToolPromptService } from './tool-prompt.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolCall } from './types/tool.type';

/** @deprecated 主链路已改由 AiOrchestrator + AgentOrchestrator / Direct LLM，保留供兼容与单测参考 */
@Injectable()
export class ToolOrchestratorService {
  constructor(
    private readonly aiService: AiService,
    private readonly toolPrompt: ToolPromptService,
    private readonly parser: ToolCallParserService,
    private readonly registry: ToolRegistryService,
    @Inject(forwardRef(() => ContextEngineService))
    private readonly contextEngine: ContextEngineService,
    @Inject(forwardRef(() => ContextComposerService))
    private readonly contextComposer: ContextComposerService,
  ) {}

  /** 工具感知流式：第一轮判工具 → 执行 → 第二轮流式回答 */
  streamWithTools(
    messages: ChatMessage[],
    summary?: string | null,
    contextPlan?: ContextPlan,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      let streamSub: { unsubscribe: () => void } | undefined;
      let aborted = false;

      const run = async () => {
        try {
          const round1Messages = this.buildRound1Messages(messages);
          const first = await this.aiService.chat(round1Messages, summary, {
            skipCache: true,
          });

          if (aborted) return;

          const resolvedFirst = resolveModelReply(
            first.thinking,
            first.response,
          );
          const toolCall = this.parser.parse(
            resolvedFirst.response || resolvedFirst.thinking,
            this.registry.getKnownToolNames(),
          );

          if (!toolCall) {
            this.emitDone(subscriber, resolvedFirst.thinking, resolvedFirst.response);
            subscriber.complete();
            return;
          }

          this.emit(subscriber, {
            phase: 'tool_call',
            tool: toolCall.tool,
            args: toolCall.args,
          });

          const toolResult = await this.executeTool(toolCall);
          if (aborted) return;

          this.emit(subscriber, {
            phase: 'tool_result',
            tool: toolCall.tool,
            result: toolResult.result,
            ...(toolResult.error ? { error: toolResult.error } : {}),
          });

          const round2Messages = this.buildRound2Messages(
            messages,
            toolCall,
            toolResult.result,
            contextPlan,
          );

          streamSub = this.aiService
            .streamChat(round2Messages, summary, { skipCache: true })
            .subscribe({
              next: (event) => subscriber.next(event),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
        } catch (err) {
          subscriber.error(err);
        }
      };

      void run();

      return () => {
        aborted = true;
        streamSub?.unsubscribe();
      };
    });
  }

  private buildRound1Messages(messages: ChatMessage[]): ChatMessage[] {
    return [
      { role: 'system', content: this.toolPrompt.build() },
      ...messages,
    ];
  }

  private buildRound2Messages(
    messages: ChatMessage[],
    toolCall: ToolCall,
    toolResult: string,
    contextPlan?: ContextPlan,
  ): ChatMessage[] {
    if (contextPlan) {
      const round2Plan = this.contextEngine.extendPlanWithToolResult(
        contextPlan,
        toolCall.tool,
        toolResult,
      );
      return this.contextComposer.composeRound2(round2Plan, toolCall);
    }

    return [
      ...messages,
      { role: 'assistant', content: toolCall.raw },
      {
        role: 'user',
        content: `工具 ${toolCall.tool} 返回结果：${toolResult}。请根据该结果用自然语言回答用户。`,
      },
    ];
  }

  private async executeTool(
    toolCall: ToolCall,
  ): Promise<{ result: string; error?: string }> {
    try {
      const result = await this.registry.execute(toolCall.tool, toolCall.args);
      return { result };
    } catch (err) {
      const message = err instanceof Error ? err.message : '工具执行失败';
      return { result: message, error: message };
    }
  }

  private emit(subscriber: Subscriber<MessageEvent>, data: Record<string, unknown>) {
    subscriber.next({ data } as MessageEvent);
  }

  private emitDone(
    subscriber: Subscriber<MessageEvent>,
    thinking: string,
    response: string,
  ) {
    subscriber.next({
      data: {
        thinking,
        response,
        done: true,
      },
    } as MessageEvent);
  }
}
