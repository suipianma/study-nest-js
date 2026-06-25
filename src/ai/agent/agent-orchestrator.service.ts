import { Injectable } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { AiService } from '../ai.service';
import { ChatMessage } from '../types/chat-message.type';
import { resolveModelReply } from '../utils/reply.util';
import { ToolCallParserService } from '../tools/tool-call-parser.service';
import { ToolPromptService } from '../tools/tool-prompt.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ToolCall } from '../tools/types/tool.type';
import { MAX_AGENT_STEPS } from './agent.constants';
import { AgentContext } from './agent-context.type';

@Injectable()
export class AgentOrchestratorService {
  constructor(
    private readonly aiService: AiService,
    private readonly toolPrompt: ToolPromptService,
    private readonly parser: ToolCallParserService,
    private readonly registry: ToolRegistryService,
  ) {}

  /** 多步 ReAct：判工具 → 执行 → 循环，最终流式回答 */
  streamWithAgent(
    messages: ChatMessage[],
    summary: string | null | undefined,
    agentContext: AgentContext,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      let streamSub: { unsubscribe: () => void } | undefined;
      let aborted = false;

      const run = async () => {
        try {
          this.registry.setAgentContext(agentContext);
          this.emit(subscriber, {
            phase: 'agent_start',
            maxSteps: MAX_AGENT_STEPS,
          });

          const workingMessages = [...messages];
          let executedSteps = 0;

          for (let step = 1; step <= MAX_AGENT_STEPS; step += 1) {
            if (aborted) return;

            this.emit(subscriber, {
              phase: 'agent_step',
              step,
              maxSteps: MAX_AGENT_STEPS,
            });

            const roundMessages = this.buildToolMessages(workingMessages);
            const first = await this.aiService.chat(roundMessages, summary, {
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
              await this.streamFinalAnswer(
                subscriber,
                workingMessages,
                summary,
                executedSteps,
                (sub) => {
                  streamSub = sub;
                },
                () => aborted,
              );
              return;
            }

            executedSteps += 1;
            this.emit(subscriber, {
              phase: 'tool_call',
              tool: toolCall.tool,
              args: toolCall.args,
              step,
            });

            const toolResult = await this.executeTool(toolCall);
            if (aborted) return;

            this.emit(subscriber, {
              phase: 'tool_result',
              tool: toolCall.tool,
              result: toolResult.result,
              step,
              ...(toolResult.error ? { error: toolResult.error } : {}),
            });

            workingMessages.push(
              { role: 'assistant', content: toolCall.raw },
              {
                role: 'user',
                content: `工具 ${toolCall.tool} 返回结果：${toolResult.result}。若仍需其他工具请继续输出 JSON；否则将生成最终回答。`,
              },
            );
          }

          workingMessages.push({
            role: 'user',
            content:
              '已达到最大推理步数，请根据已有工具结果用自然语言给出最终回答，不要输出 JSON。',
          });

          await this.streamFinalAnswer(
            subscriber,
            workingMessages,
            summary,
            executedSteps,
            (sub) => {
              streamSub = sub;
            },
            () => aborted,
          );
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

  private buildToolMessages(messages: ChatMessage[]): ChatMessage[] {
    return [{ role: 'system', content: this.toolPrompt.build() }, ...messages];
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

  private streamFinalAnswer(
    subscriber: Subscriber<MessageEvent>,
    messages: ChatMessage[],
    summary: string | null | undefined,
    executedSteps: number,
    setStreamSub: (sub: { unsubscribe: () => void }) => void,
    isAborted: () => boolean,
  ): Promise<void> {
    this.emit(subscriber, {
      phase: 'agent_done',
      steps: executedSteps,
    });

    return new Promise((resolve, reject) => {
      const sub = this.aiService
        .streamChat(messages, summary, { skipCache: true })
        .subscribe({
          next: (event) => subscriber.next(event),
          error: (err) => reject(err),
          complete: () => {
            if (!isAborted()) subscriber.complete();
            resolve();
          },
        });
      setStreamSub(sub);
    });
  }

  private emit(
    subscriber: Subscriber<MessageEvent>,
    data: Record<string, unknown>,
  ) {
    subscriber.next({ data } as MessageEvent);
  }
}
