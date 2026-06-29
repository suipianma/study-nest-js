import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from '../embedding/embedding.service';
import { QDRANT_COLLECTION, QDRANT_MEMORY_COLLECTION } from '../knowledge-base/constants';

interface SearchOptions {
  knowledgeBaseIds?: number[];
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private readonly client: QdrantClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.client = new QdrantClient({
      url: this.configService.get<string>('QDRANT_URL') ?? 'http://localhost:6333',
    });
  }

  async onModuleInit(): Promise<void> {
    const configuredSize = Number(this.configService.get<string>('EMBED_VECTOR_SIZE'));
    if (Number.isFinite(configuredSize) && configuredSize > 0) {
      await this.ensureCollection(configuredSize);
      await this.ensureMemoryCollection(configuredSize);
      return;
    }

    const probeVector = await this.embeddingService.embed('test');
    await this.ensureCollection(probeVector.length);
    await this.ensureMemoryCollection(probeVector.length);
  }

  async ensureMemoryCollection(vectorSize: number): Promise<void> {
    const existsResult = await this.client.collectionExists(
      QDRANT_MEMORY_COLLECTION,
    );
    const exists =
      typeof existsResult === 'boolean' ? existsResult : existsResult.exists;

    if (exists) return;

    await this.client.createCollection(QDRANT_MEMORY_COLLECTION, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });

    this.logger.log(
      `Qdrant collection ${QDRANT_MEMORY_COLLECTION} created(size=${vectorSize})`,
    );
  }

  async ensureCollection(vectorSize: number): Promise<void> {
    const existsResult = await this.client.collectionExists(QDRANT_COLLECTION);
    const exists =
      typeof existsResult === 'boolean' ? existsResult : existsResult.exists;

    if (exists) return;

    await this.client.createCollection(QDRANT_COLLECTION, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });

    this.logger.log(
      `Qdrant collection ${QDRANT_COLLECTION} created(size=${vectorSize})`,
    );
  }

  async upsertChunk(options: {
    chunkId: number;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.client.upsert(QDRANT_COLLECTION, {
      wait: true,
      points: [
        {
          id: options.chunkId,
          vector: options.vector,
          payload: options.payload,
        },
      ],
    });
  }

  async deleteByChunkIds(chunkIds: number[]): Promise<void> {
    if (chunkIds.length === 0) return;

    await this.client.delete(QDRANT_COLLECTION, {
      wait: true,
      points: chunkIds,
    });
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: number): Promise<void> {
    await this.client.delete(QDRANT_COLLECTION, {
      wait: true,
      filter: {
        must: [
          {
            key: 'knowledgeBaseId',
            match: { value: knowledgeBaseId },
          },
        ],
      },
    });
  }

  async search(
    queryVector: number[],
    options: SearchOptions,
    limit: number,
  ) {
    const filter =
      options.knowledgeBaseIds && options.knowledgeBaseIds.length > 0
        ? {
            should: options.knowledgeBaseIds.map((id) => ({
              key: 'knowledgeBaseId',
              match: { value: id },
            })),
          }
        : undefined;

    return this.client.search(QDRANT_COLLECTION, {
      vector: queryVector,
      limit,
      with_payload: true,
      with_vector: false,
      ...(filter ? { filter } : {}),
    });
  }

  async upsertMemory(options: {
    memoryId: number;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureMemoryCollection(options.vector.length);
    await this.client.upsert(QDRANT_MEMORY_COLLECTION, {
      wait: true,
      points: [
        {
          id: options.memoryId,
          vector: options.vector,
          payload: options.payload,
        },
      ],
    });
  }

  async deleteMemory(memoryId: number): Promise<void> {
    await this.client.delete(QDRANT_MEMORY_COLLECTION, {
      wait: true,
      points: [memoryId],
    });
  }

  async searchMemories(queryVector: number[], limit: number) {
    return this.client.search(QDRANT_MEMORY_COLLECTION, {
      vector: queryVector,
      limit,
      with_payload: true,
      with_vector: false,
    });
  }
}
