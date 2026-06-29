import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { INGEST_QUEUE } from './ingest-queue.constants';
import { IngestService } from './ingest.service';

@Processor(INGEST_QUEUE)
export class IngestProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestProcessor.name);

  constructor(private readonly ingestService: IngestService) {
    super();
  }

  async process(job: Job<{ documentId: number }>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(
      `开始处理入库任务 documentId=${documentId} attempt=${job.attemptsMade + 1}`,
    );
    await this.ingestService.ingestDocument(documentId);
  }
}
