import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiCacheService } from './ai-cache.service';
import { OllamaProvider } from './providers/ollama.provider';
import { ChatReply } from './providers/ai.provider';
import { ChatMessage } from './types/chat-message.type';

interface StreamPayload {
  thinking: string;
  response: string;
  done?: boolean;
  fromCache?: boolean;
}

@Injectable()
export class AiService {
  constructor(
    private readonly provider: OllamaProvider,
    private readonly cacheService: AiCacheService,
  ) {}

  async chat(
    messages: ChatMessage[],
    summary?: string | null,
  ): Promise<ChatReply> {
    const cached = await this.cacheService.get(messages, summary);
    if (cached) return cached;

    const result = await this.provider.chat(messages);
    await this.cacheService.set(messages, result, summary);
    return result;
  }

  streamChat(
    messages: ChatMessage[],
    summary?: string | null,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      let subscription: { unsubscribe: () => void } | undefined;
      let thinking = '';
      let response = '';

      const startStream = async () => {
        const cached = await this.cacheService.get(messages, summary);
        if (cached) {
          subscriber.next({
            data: {
              thinking: cached.thinking,
              response: cached.response,
              done: true,
              fromCache: true,
            },
          } as MessageEvent);
          subscriber.complete();
          return;
        }

        subscription = this.provider.streamChat(messages).subscribe({
          next: (event) => {
            const payload = this.parseStreamPayload(event.data);
            if (payload.thinking) thinking = payload.thinking;
            if (payload.response) response = payload.response;
            subscriber.next(event);
          },
          error: (err) => subscriber.error(err),
          complete: async () => {
            await this.cacheService.set(
              messages,
              { thinking, response },
              summary,
            );
            subscriber.complete();
          },
        });
      };

      startStream().catch((err) => subscriber.error(err));

      return () => subscription?.unsubscribe();
    });
  }

  private parseStreamPayload(data: unknown): StreamPayload {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as StreamPayload;
      } catch {
        return { thinking: '', response: data };
      }
    }

    if (data && typeof data === 'object') {
      return data as StreamPayload;
    }

    return { thinking: '', response: '' };
  }
}
