import { NotFoundException } from '@nestjs/common';
import { ContextTraceStoreService } from './context-trace-store.service';

describe('ContextTraceStoreService', () => {
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('save 应写入 Redis', async () => {
    const service = new ContextTraceStoreService({ redis } as any);
    await service.save(3, 9, {
      requestId: 'req-1',
      traceId: 'trace-req-1',
      conversationId: 9,
      userId: 3,
      model: 'qwen3:8b',
      budget: {
        maxTokens: 8000,
        reservedForResponse: 2000,
        availableForContext: 6000,
        usedTokens: 100,
        categoryTokenUsage: {
          summary: 0,
          message: 100,
          rag: 0,
          tool: 0,
          memory: 0,
        },
      },
      selectedBlocks: [],
      droppedBlocks: [],
      trace: [],
    });

    expect(redis.set).toHaveBeenCalledWith(
      'context-trace:req-1',
      expect.stringContaining('"requestId":"req-1"'),
      'EX',
      expect.any(Number),
    );
  });

  it('get 在 trace 不存在时应抛出 NotFoundException', async () => {
    redis.get.mockResolvedValue(null);
    const service = new ContextTraceStoreService({ redis } as any);

    await expect(service.get(9, 3, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
