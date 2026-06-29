import { IngestQueueService } from './ingest-queue.service';
import { INGEST_QUEUE } from './ingest-queue.constants';

describe('IngestQueueService', () => {
  it('enqueue 应将 documentId 推入 Bull 队列', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const service = new IngestQueueService({ add } as any);

    await service.enqueue(42);

    expect(add).toHaveBeenCalledWith('ingest', { documentId: 42 });
  });

  it('应注入正确的队列名', () => {
    expect(INGEST_QUEUE).toBe('document-ingest');
  });
});
