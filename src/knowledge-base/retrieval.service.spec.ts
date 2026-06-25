import { RetrievalService } from './retrieval.service';

describe('RetrievalService', () => {
  let service: RetrievalService;
  const embeddingService = { embed: jest.fn() };
  const qdrantService = { search: jest.fn() };
  const knowledgeBaseService = { findAccessible: jest.fn() };
  const prisma = {
    document: {
      findMany: jest.fn(),
    },
    chunk: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RetrievalService(
      embeddingService as any,
      qdrantService as any,
      knowledgeBaseService as any,
      prisma as any,
    );
  });

  it('search 应按阈值过滤并返回 RagChunk', async () => {
    knowledgeBaseService.findAccessible.mockResolvedValue([{ id: 1 }]);
    embeddingService.embed.mockResolvedValue([0.1, 0.2]);
    prisma.document.findMany.mockResolvedValue([]);
    qdrantService.search.mockResolvedValue([
      { score: 0.9, payload: { chunkId: 11 } },
      { score: 0.1, payload: { chunkId: 12 } },
    ]);
    prisma.chunk.findMany.mockResolvedValue([
      {
        id: 11,
        content: 'chunk-11',
        page: 3,
        documentId: 1001,
        document: { filename: '手册.pdf', knowledgeBaseId: 1 },
      },
    ]);

    const result = await service.search('hello', [1], {
      userId: 1,
      role: 'user',
    });

    expect(qdrantService.search).toHaveBeenCalledWith(
      [0.1, 0.2],
      { knowledgeBaseIds: [1] },
      24,
    );
    expect(result).toHaveLength(1);
    expect(result[0].chunkId).toBe(11);
    expect(result[0].score).toBe(0.9);
  });

  it('有关键词命中时应过滤仅向量误召回', async () => {
    knowledgeBaseService.findAccessible.mockResolvedValue([{ id: 1 }]);
    embeddingService.embed.mockResolvedValue([0.1]);
    prisma.document.findMany.mockResolvedValue([{ id: 100 }]);
    prisma.chunk.findMany
      .mockResolvedValueOnce([{ id: 21, content: '聘用原则说明' }])
      .mockResolvedValueOnce([
        {
          id: 21,
          content: '聘用原则说明',
          page: 1,
          documentId: 100,
          document: { filename: '人事.pdf', knowledgeBaseId: 1 },
        },
      ]);
    qdrantService.search.mockResolvedValue([
      { score: 0.62, payload: { chunkId: 22 } },
      { score: 0.8, payload: { chunkId: 21 } },
    ]);

    const result = await service.search('聘用原则是什么', [1], {
      userId: 1,
      role: 'user',
    });

    expect(result).toHaveLength(1);
    expect(result[0].chunkId).toBe(21);
  });

  it('toCitations 应映射 citation 结构', () => {
    const citations = service.toCitations([
      {
        chunkId: 1,
        documentId: 2,
        documentName: '手册.pdf',
        knowledgeBaseId: 3,
        page: 2,
        content: 'abc',
        score: 0.8,
      },
    ]);

    expect(citations).toEqual([
      {
        chunkId: 1,
        documentName: '手册.pdf',
        page: 2,
        snippet: 'abc',
        score: 0.8,
      },
    ]);
  });
});
