import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import {
  StreamSession,
  StreamSessionSnapshot,
  StreamSessionStatus,
} from './types/stream-session.type';

const SESSION_TTL_SECONDS = 60 * 30;

@Injectable()
export class StreamSessionService {
  constructor(private readonly redisService: RedisService) {}

  createSession(input: {
    conversationId: number;
    userId: number;
    userMessageContent: string;
    isFirstAiReply: boolean;
  }): Promise<StreamSession> {
    const now = Date.now();
    const session: StreamSession = {
      streamId: randomUUID(),
      conversationId: input.conversationId,
      userId: input.userId,
      status: 'generating',
      thinking: '',
      response: '',
      seq: 0,
      fromCache: false,
      userMessageContent: input.userMessageContent,
      isFirstAiReply: input.isFirstAiReply,
      createdAt: now,
      updatedAt: now,
    };

    return this.saveSession(session).then(() => session);
  }

  async getSession(streamId: string): Promise<StreamSession | null> {
    const raw = await this.redisService.redis.get(this.sessionKey(streamId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StreamSession;
  }

  async getActiveSession(
    conversationId: number,
    userId: number,
  ): Promise<StreamSession | null> {
    const streamId = await this.redisService.redis.get(
      this.activeKey(conversationId, userId),
    );
    if (!streamId) {
      return null;
    }
    const session = await this.getSession(streamId);
    if (!session || session.status !== 'generating') {
      return null;
    }
    return session;
  }

  async updateProgress(
    streamId: string,
    patch: Partial<
      Pick<
        StreamSession,
        | 'thinking'
        | 'response'
        | 'fromCache'
        | 'promptTokens'
        | 'completionTokens'
      >
    >,
  ): Promise<StreamSession | null> {
    const session = await this.getSession(streamId);
    if (!session) {
      return null;
    }

    const next: StreamSession = {
      ...session,
      ...patch,
      seq: session.seq + 1,
      updatedAt: Date.now(),
    };
    await this.saveSession(next);
    return next;
  }

  async markStatus(
    streamId: string,
    status: StreamSessionStatus,
    error?: string,
  ): Promise<StreamSession | null> {
    const session = await this.getSession(streamId);
    if (!session) {
      return null;
    }

    const next: StreamSession = {
      ...session,
      status,
      error,
      seq: session.seq + 1,
      updatedAt: Date.now(),
    };
    await this.saveSession(next);
    if (status !== 'generating') {
      await this.redisService.redis.del(
        this.activeKey(session.conversationId, session.userId),
      );
    }
    return next;
  }

  toSnapshot(session: StreamSession): StreamSessionSnapshot {
    return {
      streamId: session.streamId,
      conversationId: session.conversationId,
      status: session.status,
      thinking: session.thinking,
      response: session.response,
      seq: session.seq,
      fromCache: session.fromCache,
      error: session.error,
      done: session.status !== 'generating',
    };
  }

  private async saveSession(session: StreamSession): Promise<void> {
    await this.redisService.redis
      .multi()
      .set(
        this.sessionKey(session.streamId),
        JSON.stringify(session),
        'EX',
        SESSION_TTL_SECONDS,
      )
      .set(
        this.activeKey(session.conversationId, session.userId),
        session.streamId,
        'EX',
        SESSION_TTL_SECONDS,
      )
      .exec();
  }

  private sessionKey(streamId: string): string {
    return `stream:session:${streamId}`;
  }

  private activeKey(conversationId: number, userId: number): string {
    return `stream:active:${userId}:${conversationId}`;
  }
}
