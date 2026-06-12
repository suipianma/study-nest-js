import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ChatReply } from './providers/ai.provider';

@Injectable()
export class AiCacheService {
  private readonly ttlSeconds: number;
  private readonly model: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = Number(
      this.configService.get<string>('AI_CACHE_TTL') ?? 86_400,
    );
    this.model = this.configService.get<string>('OLLAMA_MODEL') ?? 'qwen3:8b';
  }

  private buildKey(prompt: string): string {
    const hash = createHash('sha256').update(prompt.trim()).digest('hex');
    return `ai:cache:${this.model}:${hash}`;
  }

  async get(prompt: string): Promise<ChatReply | null> {
    const raw = await this.redisService.redis.get(this.buildKey(prompt));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as ChatReply;
      if (!parsed.response && !parsed.thinking) return null;
      return {
        thinking: parsed.thinking ?? '',
        response: parsed.response ?? '',
      };
    } catch {
      return null;
    }
  }

  async set(prompt: string, reply: ChatReply): Promise<void> {
    if (!reply.response && !reply.thinking) return;

    await this.redisService.redis.set(
      this.buildKey(prompt),
      JSON.stringify({
        thinking: reply.thinking ?? '',
        response: reply.response ?? '',
      }),
      'EX',
      this.ttlSeconds,
    );
  }
}
