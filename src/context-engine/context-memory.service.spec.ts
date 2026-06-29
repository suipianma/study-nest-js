import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Memory, MemoryScope, MemoryType } from '@prisma/client';
import { ContextMemoryService } from './context-memory.service';

const baseMemory: Memory = {
  id: 1,
  ownerUserId: 7,
  scope: MemoryScope.USER,
  type: MemoryType.FACT,
  category: '偏好',
  content: '喜欢 TypeScript',
  sourceConversationId: null,
  sourceMessageId: null,
  importance: 80,
  expiresAt: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ContextMemoryService', () => {
  let service: ContextMemoryService;
  const prisma = {
    memory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
  };
  const embeddingService = {
    embed: jest.fn().mockRejectedValue(new Error('e2e skip vector')),
  };
  const qdrantService = {
    searchMemories: jest.fn(),
    upsertMemory: jest.fn().mockResolvedValue(undefined),
    deleteMemory: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    embeddingService.embed.mockRejectedValue(new Error('e2e skip vector'));
    service = new ContextMemoryService(
      prisma as any,
      embeddingService as any,
      qdrantService as any,
    );
  });

  it('普通用户仅可创建自己的私有记忆', async () => {
    prisma.memory.create.mockResolvedValue(baseMemory);

    await service.createMemory(
      {
        scope: MemoryScope.USER,
        type: MemoryType.FACT,
        category: '偏好',
        content: '喜欢 TypeScript',
      },
      { userId: 7, role: 'user' },
    );

    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: 7,
        scope: MemoryScope.USER,
      }),
    });
  });

  it('普通用户创建 GLOBAL 记忆应拒绝', async () => {
    await expect(
      service.createMemory(
        {
          scope: MemoryScope.GLOBAL,
          type: MemoryType.FACT,
          category: '团队规则',
          content: '请遵守发布规范',
        },
        { userId: 7, role: 'user' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it('管理员可创建 team/org 记忆', async () => {
    prisma.memory.create.mockResolvedValue({
      ...baseMemory,
      scope: MemoryScope.GLOBAL,
      ownerUserId: 9,
    });

    await service.createMemory(
      {
        scope: MemoryScope.GLOBAL,
        type: MemoryType.POLICY,
        category: '组织政策',
        content: '所有输出必须脱敏',
        ownerUserId: 9,
      },
      { userId: 1, role: 'admin' },
    );

    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: MemoryScope.GLOBAL,
        ownerUserId: 9,
      }),
    });
  });

  it('普通用户可为自己会话创建 CONVERSATION 记忆', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ userId: 7 });
    prisma.memory.create.mockResolvedValue({
      ...baseMemory,
      scope: MemoryScope.CONVERSATION,
      sourceConversationId: 12,
    });

    await service.createMemory(
      {
        scope: MemoryScope.CONVERSATION,
        type: MemoryType.FACT,
        category: '任务',
        content: '当前在处理登录页',
        sourceConversationId: 12,
      },
      { userId: 7, role: 'user' },
    );

    expect(prisma.memory.create).toHaveBeenCalled();
  });

  it('向量检索命中时应按相似度顺序返回', async () => {
    embeddingService.embed.mockResolvedValue([0.1, 0.2]);
    qdrantService.searchMemories.mockResolvedValue([
      { id: 2, payload: { memoryId: 2 } },
      { id: 1, payload: { memoryId: 1 } },
    ]);
    prisma.memory.findMany.mockResolvedValue([
      { ...baseMemory, id: 1 },
      { ...baseMemory, id: 2, content: '偏好 Rust' },
    ]);

    const result = await service.searchMemories(
      { query: '编程语言' },
      { userId: 7, role: 'user' },
    );

    expect(result.map((item) => item.id)).toEqual([2, 1]);
    expect(qdrantService.searchMemories).toHaveBeenCalled();
  });

  it('查询应过滤已删除和已过期记忆', async () => {
    prisma.memory.findMany.mockResolvedValue([]);

    await service.searchMemories({ query: 'TypeScript' }, { userId: 1, role: 'admin' });

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          { deletedAt: null },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
          { content: { contains: 'TypeScript' } },
        ]),
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });
  });

  it('普通用户默认可访问 USER/GLOBAL/CONVERSATION 记忆', async () => {
    prisma.memory.findMany.mockResolvedValue([]);

    await service.searchMemories({}, { userId: 7, role: 'user' });

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          {
            OR: [
              { ownerUserId: 7, scope: MemoryScope.USER },
              { scope: MemoryScope.GLOBAL },
              {
                scope: MemoryScope.CONVERSATION,
                sourceConversation: { userId: 7 },
              },
            ],
          },
        ]),
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });
  });

  it('普通用户可按 GLOBAL scope 查询全局记忆', async () => {
    prisma.memory.findMany.mockResolvedValue([]);

    await service.searchMemories(
      { scope: MemoryScope.GLOBAL },
      { userId: 7, role: 'user' },
    );

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([{ scope: MemoryScope.GLOBAL }]),
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });
  });

  it('普通用户可按 CONVERSATION scope 查询自己会话记忆', async () => {
    prisma.memory.findMany.mockResolvedValue([]);

    await service.searchMemories(
      { scope: MemoryScope.CONVERSATION, conversationId: 12 },
      { userId: 7, role: 'user' },
    );

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          { sourceConversationId: 12 },
          {
            scope: MemoryScope.CONVERSATION,
            sourceConversation: { userId: 7 },
          },
        ]),
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });
  });

  it('管理员查询可按传入 scope 过滤', async () => {
    prisma.memory.findMany.mockResolvedValue([]);

    await service.searchMemories(
      { scope: MemoryScope.GLOBAL },
      { userId: 1, role: 'admin' },
    );

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([{ scope: MemoryScope.GLOBAL }]),
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });
  });

  it('普通用户可遗忘自己的私有记忆', async () => {
    prisma.memory.findUnique.mockResolvedValue(baseMemory);
    prisma.memory.update.mockResolvedValue({
      ...baseMemory,
      deletedAt: new Date(),
    });

    await service.forgetMemory(1, { userId: 7, role: 'user' });

    expect(prisma.memory.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('普通用户遗忘非私有记忆应拒绝', async () => {
    prisma.memory.findUnique.mockResolvedValue({
      ...baseMemory,
      scope: MemoryScope.GLOBAL,
    });

    await expect(service.forgetMemory(1, { userId: 7, role: 'user' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('管理员可遗忘任意记忆', async () => {
    prisma.memory.findUnique.mockResolvedValue({
      ...baseMemory,
      scope: MemoryScope.GLOBAL,
      ownerUserId: 99,
    });
    prisma.memory.update.mockResolvedValue({
      ...baseMemory,
      deletedAt: new Date(),
    });

    await service.forgetMemory(1, { userId: 1, role: 'admin' });

    expect(prisma.memory.update).toHaveBeenCalled();
  });

  it('遗忘不存在的记忆应抛出 NotFoundException', async () => {
    prisma.memory.findUnique.mockResolvedValue(null);

    await expect(service.forgetMemory(404, { userId: 1, role: 'admin' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('toContextBlocks 应映射为 ContextBlock[]', () => {
    const result = service.toContextBlocks([baseMemory]);

    expect(result).toEqual([
      expect.objectContaining({
        id: 'memory-1',
        type: 'memory',
        role: 'user',
        content: '[偏好] 喜欢 TypeScript',
        source: 'memory:1',
        priority: 100,
        metadata: expect.objectContaining({
          memoryId: 1,
          scope: MemoryScope.USER,
          category: '偏好',
        }),
        estimatedTokens: expect.any(Number),
      }),
    ]);
  });
});
