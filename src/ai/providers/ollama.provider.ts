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
    };
  }

  async chat(messages: ChatMessage[]): Promise<ChatReply> {
    const { baseUrl, model } = this.getOllamaConfig();

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
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
    const thinking = (data.message?.thinking ?? data.thinking ?? '').trim();
    const response = (data.message?.content ?? data.response ?? '').trim();

    return { thinking, response };
  }

  streamChat(messages: ChatMessage[]): Observable<MessageEvent> {
    const { baseUrl, model } = this.getOllamaConfig();

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
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
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

                subscriber.next({
                  data: {
                    thinking: thinking.trim(),
                    response: response.trim(),
                    done: !!json.done,
                  },
                } as MessageEvent);

                if (json.done) {
                  subscriber.complete();
                  return;
                }
              } catch {
                // 跳过无法解析的行
              }
            }
          }

          subscriber.complete();
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') {
            subscriber.error(new RequestTimeoutException('AI 流式生成超时'));
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
