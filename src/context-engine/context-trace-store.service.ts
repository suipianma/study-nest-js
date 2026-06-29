import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ContextPlan } from './types/context-plan.type';

const TRACE_TTL_SECONDS = 60 * 60 * 24;

export interface StoredContextTrace {
  requestId: string;
  traceId: string;
  conversationId: number;
  userId: number;
  model: string;
  budget: ContextPlan['budget'];
  selectedBlocks: ContextPlan['selectedBlocks'];
  droppedBlocks: ContextPlan['droppedBlocks'];
  trace: ContextPlan['trace'];
  stageTimings?: Record<string, number>;
  savedAt: number;
}

@Injectable()
export class ContextTraceStoreService {
  constructor(private readonly redisService: RedisService) {}

  async save(
    userId: number,
    conversationId: number,
    plan: ContextPlan,
    extras?: { stageTimings?: Record<string, number> },
  ): Promise<void> {
    const payload: StoredContextTrace = {
      requestId: plan.requestId,
      traceId: plan.traceId,
      conversationId,
      userId,
      model: plan.model,
      budget: plan.budget,
      selectedBlocks: plan.selectedBlocks,
      droppedBlocks: plan.droppedBlocks,
      trace: plan.trace,
      stageTimings: extras?.stageTimings,
      savedAt: Date.now(),
    };

    await this.redisService.redis.set(
      this.key(plan.requestId),
      JSON.stringify(payload),
      'EX',
      TRACE_TTL_SECONDS,
    );
  }

  async get(
    conversationId: number,
    userId: number,
    requestId: string,
  ): Promise<StoredContextTrace> {
    const raw = await this.redisService.redis.get(this.key(requestId));
    if (!raw) {
      throw new NotFoundException('上下文 Trace 不存在或已过期');
    }

    const trace = JSON.parse(raw) as StoredContextTrace;
    if (trace.conversationId !== conversationId || trace.userId !== userId) {
      throw new NotFoundException('上下文 Trace 不存在或已过期');
    }

    return trace;
  }

  private key(requestId: string): string {
    return `context-trace:${requestId}`;
  }
}
