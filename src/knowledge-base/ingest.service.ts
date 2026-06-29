import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { readFile } from 'fs/promises';
import { EmbeddingService } from '../embedding/embedding.service';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../vector/qdrant.service';
import { ChunkService, type ChunkPiece } from './chunk.service';
import { DocxParser } from './parsers/docx.parser';
import { resolveParser } from './parsers/parser.registry';
import { PdfParser } from './parsers/pdf.parser';
import { TextParser } from './parsers/text.parser';

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkService: ChunkService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly textParser: TextParser,
    private readonly pdfParser: PdfParser,
    private readonly docxParser: DocxParser,
  ) {}

  async ingestDocument(documentId: number): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { knowledgeBase: true },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing', errorMessage: null },
    });

    try {
      await this.deleteDocumentVectors(documentId);

      const fileBuffer = await readFile(document.filePath);
      const parser = resolveParser(document.mimeType, document.filename, {
        textParser: this.textParser,
        pdfParser: this.pdfParser,
        docxParser: this.docxParser,
      });
      const parsed = await parser.parse(fileBuffer);
      const pieces: Array<ChunkPiece & { page?: number }> = parsed.pages?.length
        ? parsed.pages.flatMap((page) =>
            this.chunkService.split(page.text).map((piece) => ({
              ...piece,
              page: page.page,
            })),
          )
        : this.chunkService.split(parsed.text);

      const vectors = await this.embeddingService.embedTexts(
        pieces.map((piece) => piece.content),
      );

      const createdChunks: { id: number }[] = [];
      for (let i = 0; i < pieces.length; i += 1) {
        const piece = pieces[i];
        const chunk = await this.prisma.chunk.create({
          data: {
            documentId,
            index: piece.index,
            content: piece.content,
            page: piece.page,
          },
        });
        createdChunks.push(chunk);

        await this.qdrantService.upsertChunk({
          chunkId: chunk.id,
          vector: vectors[i],
          payload: {
            chunkId: chunk.id,
            documentId,
            knowledgeBaseId: document.knowledgeBaseId,
            ownerId: document.knowledgeBase.userId,
            visibility: document.knowledgeBase.visibility,
          },
        });
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'ready',
          chunkCount: createdChunks.length,
          errorMessage: null,
        },
      });
    } catch (error) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          errorMessage:
            error instanceof Error ? error.message.slice(0, 2000) : '未知错误',
        },
      });
      throw new InternalServerErrorException('文档入库失败');
    }
  }

  async ingestDocumentWithRetry(
    documentId: number,
    maxAttempts = 3,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.ingestDocument(documentId);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await this.prisma.document.update({
            where: { id: documentId },
            data: { status: 'pending', errorMessage: null },
          });
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    throw lastError;
  }

  async deleteDocumentVectors(documentId: number): Promise<void> {
    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      select: { id: true },
    });

    const chunkIds = chunks.map((item) => item.id);
    await this.qdrantService.deleteByChunkIds(chunkIds);

    await this.prisma.chunk.deleteMany({
      where: { documentId },
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: { chunkCount: 0 },
    });
  }
}
