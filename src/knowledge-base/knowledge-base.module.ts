import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { VectorModule } from '../vector/vector.module';
import { ChunkService } from './chunk.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { IngestProcessor } from './ingest.processor';
import { IngestQueueService } from './ingest-queue.service';
import { IngestService } from './ingest.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { DocxParser } from './parsers/docx.parser';
import { PdfParser } from './parsers/pdf.parser';
import { TextParser } from './parsers/text.parser';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [PrismaModule, EmbeddingModule, VectorModule, QueueModule],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    ChunkService,
    IngestService,
    IngestQueueService,
    IngestProcessor,
    RetrievalService,
    TextParser,
    PdfParser,
    DocxParser,
  ],
  exports: [RetrievalService],
})
export class KnowledgeBaseModule {}
