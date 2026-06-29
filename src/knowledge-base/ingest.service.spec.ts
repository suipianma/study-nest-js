import { NotFoundException } from '@nestjs/common';
import { IngestService } from './ingest.service';

describe('IngestService ingestDocumentWithRetry', () => {
  let service: IngestService;
  const prisma = {
    document: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IngestService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: (...args: unknown[]) => void,
    ) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('首次成功不应重试', async () => {
    const ingestDocument = jest
      .spyOn(service, 'ingestDocument')
      .mockResolvedValue(undefined);

    await service.ingestDocumentWithRetry(9, 3);

    expect(ingestDocument).toHaveBeenCalledTimes(1);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('失败两次第三次成功应重置为 pending 后成功', async () => {
    const ingestDocument = jest
      .spyOn(service, 'ingestDocument')
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce(undefined);

    await service.ingestDocumentWithRetry(11, 3);

    expect(ingestDocument).toHaveBeenCalledTimes(3);
    expect(prisma.document.update).toHaveBeenCalledTimes(2);
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { status: 'pending', errorMessage: null },
    });
  });

  it('超过最大次数应抛出最后一次错误', async () => {
    const lastError = new NotFoundException('文档不存在');
    jest.spyOn(service, 'ingestDocument').mockRejectedValue(lastError);

    await expect(service.ingestDocumentWithRetry(3, 2)).rejects.toBe(lastError);
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
  });
});
