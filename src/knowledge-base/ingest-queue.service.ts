import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { INGEST_QUEUE } from './ingest-queue.constants';

@Injectable()
export class IngestQueueService {
  constructor(
    @InjectQueue(INGEST_QUEUE) private readonly ingestQueue: Queue,
  ) {}

  /** 将文档入库任务推入 Bull 队列（持久化、可重试） */
  async enqueue(documentId: number): Promise<void> {
    await this.ingestQueue.add('ingest', { documentId });
  }
}
