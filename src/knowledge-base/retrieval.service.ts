import { Injectable } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../vector/qdrant.service';
import {
  RAG_HYBRID_BOOST,
  RAG_KEYWORD_BASE_SCORE,
  RAG_KEYWORD_TOP_K,
  RAG_SCORE_THRESHOLD,
  RAG_TOP_K,
  RAG_VECTOR_CANDIDATES,
} from './constants';
import { JwtUser, KnowledgeBaseService } from './knowledge-base.service';
import { RagChunk, RagCitation } from './types/rag.type';
import {
  extractQueryKeywords,
  scoreKeywordMatch,
} from './utils/query-keywords.util';

interface RankedChunk {
  chunkId: number;
  score: number;
  keywordHit: boolean;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly prisma: PrismaService,
  ) {}

  async search(
    query: string,
    knowledgeBaseIds: number[] | undefined,
    currentUser: JwtUser,
  ): Promise<RagChunk[]> {
    const accessible = await this.knowledgeBaseService.findAccessible(
      currentUser,
      knowledgeBaseIds,
    );
    if (accessible.length === 0) return [];

    const kbIds = accessible.map((item) => item.id);
    const keywords = extractQueryKeywords(query);
    const queryVector = await this.embeddingService.embed(query);

    const [vectorPoints, keywordChunkIds] = await Promise.all([
      this.qdrantService.search(
        queryVector,
        { knowledgeBaseIds: kbIds },
        RAG_VECTOR_CANDIDATES,
      ),
      this.searchKeywordChunkIds(kbIds, keywords),
    ]);

    const ranked = this.mergeHybridScores(vectorPoints, keywordChunkIds, keywords);
    let filtered = ranked.filter((item) => item.score >= RAG_SCORE_THRESHOLD);

    // 有关键词命中时，压低「仅向量相关」的误召回（大 PDF 常见）
    if (keywords.length > 0 && filtered.some((item) => item.keywordHit)) {
      filtered = filtered.filter(
        (item) => item.keywordHit || item.score >= 0.68,
      );
    }

    const topRanked = filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, RAG_TOP_K);

    if (topRanked.length === 0) return [];

    const chunks = await this.prisma.chunk.findMany({
      where: { id: { in: topRanked.map((item) => item.chunkId) } },
      select: {
        id: true,
        content: true,
        page: true,
        documentId: true,
        document: {
          select: {
            filename: true,
            knowledgeBaseId: true,
          },
        },
      },
    });

    const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    return topRanked
      .map((item) => {
        const chunk = chunkMap.get(item.chunkId);
        if (!chunk) return null;
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentName: chunk.document.filename,
          knowledgeBaseId: chunk.document.knowledgeBaseId,
          page: chunk.page,
          content: chunk.content,
          score: item.score,
        } as RagChunk;
      })
      .filter((item): item is RagChunk => item !== null);
  }

  toCitations(chunks: RagChunk[]): RagCitation[] {
    return chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      documentName: chunk.documentName,
      page: chunk.page,
      snippet: chunk.content.slice(0, 120),
      score: chunk.score,
    }));
  }

  private async searchKeywordChunkIds(
    knowledgeBaseIds: number[],
    keywords: string[],
  ): Promise<number[]> {
    if (keywords.length === 0) return [];

    const documents = await this.prisma.document.findMany({
      where: {
        knowledgeBaseId: { in: knowledgeBaseIds },
        status: 'ready',
      },
      select: { id: true },
    });
    if (documents.length === 0) return [];

    const chunks = await this.prisma.chunk.findMany({
      where: {
        documentId: { in: documents.map((item) => item.id) },
        OR: keywords.map((keyword) => ({ content: { contains: keyword } })),
      },
      select: { id: true, content: true },
      take: RAG_KEYWORD_TOP_K * 3,
    });

    return chunks
      .map((chunk) => ({
        id: chunk.id,
        score: scoreKeywordMatch(chunk.content, keywords),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, RAG_KEYWORD_TOP_K)
      .map((item) => item.id);
  }

  private mergeHybridScores(
    vectorPoints: Array<{ score?: number; payload?: Record<string, unknown> | null }>,
    keywordChunkIds: number[],
    keywords: string[],
  ): RankedChunk[] {
    const scoreMap = new Map<number, RankedChunk>();

    for (const point of vectorPoints) {
      const chunkId = Number((point.payload as { chunkId?: number })?.chunkId);
      if (!Number.isFinite(chunkId)) continue;
      const vectorScore = point.score ?? 0;
      scoreMap.set(chunkId, {
        chunkId,
        score: vectorScore,
        keywordHit: false,
      });
    }

    for (const chunkId of keywordChunkIds) {
      const existing = scoreMap.get(chunkId);
      if (existing) {
        existing.keywordHit = true;
        existing.score = Math.min(1, existing.score + RAG_HYBRID_BOOST);
        continue;
      }

      scoreMap.set(chunkId, {
        chunkId,
        score: RAG_KEYWORD_BASE_SCORE,
        keywordHit: true,
      });
    }

    return [...scoreMap.values()];
  }
}
