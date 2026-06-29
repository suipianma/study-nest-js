import {
  BadGatewayException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import {
  OLLAMA_CHAT_TIMEOUT_MS,
  OLLAMA_STREAM_TIMEOUT_MS,
} from '../../common/constants/api.constant';
import { resolveModelReply } from '../utils/reply.util';
import { ChatMessage } from '../types/chat-message.type';
import { AIProvider, ChatReply } from './ai.provider';

interface OllamaChatChunk {
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  /** /api/generate 兼容字段 */
  thinking?: string;
  response?: string;
  done?: boolean;
  /** Ollama 返回的 token 统计 */
  prompt_eval_count?: number;
  eval_count?: number;
}

/** 从 Ollama /api/chat 单块响应中提取增量内容 */
function extractChunkDelta(chunk: OllamaChatChunk) {
  return {
    contentDelta: chunk.message?.content ?? chunk.response ?? '',
    thinkingDelta: chunk.message?.thinking ?? chunk.thinking ?? '',
  };
}

@Injectable()
export class OllamaProvider implements AIProvider {
  constructor(private readonly config: ConfigService) {}

  private getOllamaConfig() {
    return {
      baseUrl:
        this.config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434',
      model: this.config.get<string>('OLLAMA_MODEL') ?? 'qwen3:8b',
      think: this.parseThinkOption(),
    };
  }

  /** OLLAMA_THINK=false 可关闭推理模型的思考链，让小模型直接输出正文 */
  private parseThinkOption(): boolean | undefined {
    const raw = this.config.get<string>('OLLAMA_THINK');
    if (raw == null || raw === '') return undefined;
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true' || raw === '1') return true;
    return undefined;
  }

  private buildChatBody(messages: ChatMessage[], stream: boolean, modelOverride?: string) {
    const { model, think } = this.getOllamaConfig();
    return {
      model: modelOverride?.trim() || model,
      messages,
      stream,
      ...(think !== undefined ? { think } : {}),
    };
  }

  async chat(messages: ChatMessage[], modelOverride?: string): Promise<ChatReply> {
    const { baseUrl } = this.getOllamaConfig();

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildChatBody(messages, false, modelOverride)),
        signal: AbortSignal.timeout(OLLAMA_CHAT_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new RequestTimeoutException('AI 生成超时，请稍后重试');
      }
      throw new BadGatewayException(
        '无法连接 Ollama，请确认服务已启动且 OLLAMA_URL 配置正确',
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new BadGatewayException(
        `Ollama 请求失败(${res.status}): ${errText || '未知错误'}`,
      );
    }

    const data = (await res.json()) as OllamaChatChunk;
    const rawThinking = (data.message?.thinking ?? data.thinking ?? '').trim();
    const rawResponse = (data.message?.content ?? data.response ?? '').trim();
    return resolveModelReply(rawThinking, rawResponse);
  }

  streamChat(messages: ChatMessage[], modelOverride?: string): Observable<MessageEvent> {
    const { baseUrl } = this.getOllamaConfig();

    return new Observable((subscriber) => {
      let thinking = '';
      let response = '';
      let buffer = '';
      let aborted = false;
      const abortController = new AbortController();
      const timeoutTimer = setTimeout(() => {
        aborted = true;
        abortController.abort();
      }, OLLAMA_STREAM_TIMEOUT_MS);

      fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildChatBody(messages, true, modelOverride)),
        signal: abortController.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const errText = await res.text();
            subscriber.error(
              new BadGatewayException(
                `Ollama 流式请求失败(${res.status}): ${errText || '未知错误'}`,
              ),
            );
            return;
          }

          const reader = res.body?.getReader();
          if (!reader) {
            subscriber.error(new BadGatewayException('Ollama 无流式响应'));
            return;
          }

          const decoder = new TextDecoder();

          let streamDone = false;

          while (!aborted) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              try {
                const json = JSON.parse(trimmed) as OllamaChatChunk;
                const { contentDelta, thinkingDelta } = extractChunkDelta(json);
                if (thinkingDelta) thinking += thinkingDelta;
                if (contentDelta) response += contentDelta;

                if (json.done) streamDone = true;

                const hasDelta = Boolean(thinkingDelta || contentDelta);
                if (hasDelta || json.done) {
                  const resolved = json.done
                    ? resolveModelReply(thinking, response)
                    : null;

                  subscriber.next({
                    data: {
                      thinkingDelta,
                      contentDelta,
                      done: !!json.done,
                      ...(json.done
                        ? {
                            thinking: resolved!.thinking,
                            response: resolved!.response,
                            promptTokens: json.prompt_eval_count,
                            completionTokens: json.eval_count,
                          }
                        : {}),
                    },
                  } as MessageEvent);
                }

                if (json.done) {
                  subscriber.complete();
                  return;
                }
              } catch {
                // 跳过无法解析的行
              }
            }
          }

          // Ollama 偶发不返回 done 标记，补发终态避免前端误判连接中断
          if (!streamDone && !aborted) {
            const resolved = resolveModelReply(thinking, response);
            subscriber.next({
              data: {
                thinkingDelta: '',
                contentDelta: '',
                done: true,
                thinking: resolved.thinking,
                response: resolved.response,
              },
            } as MessageEvent);
          }

          subscriber.complete();
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') {
            subscriber.error(new RequestTimeoutException('AI 流式生成超时'));
            return;
          }
          if (thinking || response) {
            const resolved = resolveModelReply(thinking, response);
            subscriber.next({
              data: {
                thinkingDelta: '',
                contentDelta: '',
                done: true,
                thinking: resolved.thinking,
                response: resolved.response,
              },
            } as MessageEvent);
            subscriber.complete();
            return;
          }
          subscriber.error(err);
        })
        .finally(() => clearTimeout(timeoutTimer));

      return () => {
        aborted = true;
        clearTimeout(timeoutTimer);
        abortController.abort();
      };
    });
  }
}
