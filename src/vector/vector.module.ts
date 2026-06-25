import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { QdrantService } from './qdrant.service';

@Module({
  imports: [EmbeddingModule],
  providers: [QdrantService],
  exports: [QdrantService],
})
export class VectorModule {}
