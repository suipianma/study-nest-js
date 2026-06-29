import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Memory, MemoryScope, Prisma } from '@prisma/client';
import { EmbeddingService } from '../embedding/embedding.service';
import { JwtUser } from '../knowledge-base/knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../vector/qdrant.service';
import { estimateTokens } from './context-token.util';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { SearchMemoryDto } from './dto/search-memory.dto';
import { ContextBlock } from './types/context-block.type';

@Injectable()
export class ContextMemoryService {
  private readonly logger = new Logger(ContextMemoryService.name);
  // 记忆与历史消息（priority=100）同场竞争：高重要度记忆可优先保留。
  private readonly memoryBasePriority = 80;
  private readonly memoryImportanceStep = 4;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
  ) {}

  async createMemory(dto: CreateMemoryDto, currentUser: JwtUser): Promise<Memory> {
    const ownerUserId = dto.ownerUserId ?? currentUser.userId;
    await this.assertCanCreate(dto, ownerUserId, currentUser);

    const memory = await this.prisma.memory.create({
      data: {
        ownerUserId,
        scope: dto.scope,
        type: dto.type,
        category: dto.category,
        content: dto.content,
        importance: dto.importance,
        expiresAt: dto.expiresAt,
        sourceConversationId: dto.sourceConversationId,
        sourceMessageId: dto.sourceMessageId,
      },
    });

    void this.indexMemoryVector(memory).catch((error) => {
      this.logger.warn(
        `记忆向量索引失败 memoryId=${memory.id}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });

    return memory;
  }

  async searchMemories(
    query: SearchMemoryDto,
    currentUser: JwtUser,
  ): Promise<Memory[]> {
    const limit = query.limit ?? 10;
    const trimmedQuery = query.query?.trim();
    const accessWhere = this.buildSearchWhere(
      { ...query, query: undefined },
      currentUser,
    );
    const keywordWhere = this.buildSearchWhere(query, currentUser);

    if (trimmedQuery) {
      try {
        const vector = await this.embeddingService.embed(trimmedQuery);
        const hits = await this.qdrantService.searchMemories(
          vector,
          Math.max(limit * 2, 10),
        );
        const rankedIds = hits
          .map((hit) => Number(hit.payload?.memoryId ?? hit.id))
          .filter((id) => Number.isFinite(id));

        if (rankedIds.length > 0) {
          const memories = await this.prisma.memory.findMany({
            where: { AND: [accessWhere, { id: { in: rankedIds } }] },
          });
          const byId = new Map(memories.map((item) => [item.id, item]));
          const ordered = rankedIds
            .map((id) => byId.get(id))
            .filter((item): item is Memory => Boolean(item))
            .slice(0, limit);
          if (ordered.length > 0) {
            return ordered;
          }
        }
      } catch (error) {
        this.logger.warn(
          `记忆向量检索失败，降级关键词: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return this.prisma.memory.findMany({
      where: keywordWhere,
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
  }

  async forgetMemory(id: number, currentUser: JwtUser): Promise<Memory> {
    const memory = await this.prisma.memory.findUnique({ where: { id } });
    if (!memory) {
      throw new NotFoundException('记忆不存在');
    }

    this.assertCanForget(memory, currentUser);
    const updated = await this.prisma.memory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    void this.qdrantService.deleteMemory(id).catch((error) => {
      this.logger.warn(
        `删除记忆向量失败 memoryId=${id}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });

    return updated;
  }

  toContextBlocks(memories: Memory[]): ContextBlock[] {
    return memories.map((memory) => {
      const content = `[${memory.category}] ${memory.content}`;
      return {
        id: `memory-${memory.id}`,
        type: 'memory',
        role: 'user',
        content,
        priority:
          this.memoryBasePriority +
          Math.floor(memory.importance / this.memoryImportanceStep),
        estimatedTokens: estimateTokens(content),
        source: `memory:${memory.id}`,
        metadata: {
          memoryId: memory.id,
          scope: memory.scope,
          category: memory.category,
        },
      };
    });
  }

  private async indexMemoryVector(memory: Memory): Promise<void> {
    const vector = await this.embeddingService.embed(memory.content);
    await this.qdrantService.upsertMemory({
      memoryId: memory.id,
      vector,
      payload: {
        memoryId: memory.id,
        ownerUserId: memory.ownerUserId,
        scope: memory.scope,
      },
    });
  }

  private buildSearchWhere(
    query: SearchMemoryDto,
    currentUser: JwtUser,
  ): Prisma.MemoryWhereInput {
    const now = new Date();
    const filters: Prisma.MemoryWhereInput[] = [
      { deletedAt: null },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ];

    if (query.type) {
      filters.push({ type: query.type });
    }
    if (query.category) {
      filters.push({ category: query.category });
    }
    if (query.query) {
      filters.push({ content: { contains: query.query } });
    }
    if (query.conversationId) {
      filters.push({ sourceConversationId: query.conversationId });
    }

    if (currentUser.role === 'admin') {
      if (query.scope) {
        filters.push({ scope: query.scope });
      }
      return { AND: filters };
    }

    if (query.scope === MemoryScope.USER) {
      filters.push({ ownerUserId: currentUser.userId, scope: MemoryScope.USER });
      return { AND: filters };
    }
    if (query.scope === MemoryScope.GLOBAL) {
      filters.push({ scope: MemoryScope.GLOBAL });
      return { AND: filters };
    }
    if (query.scope === MemoryScope.CONVERSATION) {
      filters.push({
        scope: MemoryScope.CONVERSATION,
        sourceConversation: { userId: currentUser.userId },
      });
      return { AND: filters };
    }

    filters.push({
      OR: [
        { ownerUserId: currentUser.userId, scope: MemoryScope.USER },
        { scope: MemoryScope.GLOBAL },
        {
          scope: MemoryScope.CONVERSATION,
          sourceConversation: { userId: currentUser.userId },
        },
      ],
    });

    return { AND: filters };
  }

  private async assertCanCreate(
    dto: CreateMemoryDto,
    ownerUserId: number,
    currentUser: JwtUser,
  ): Promise<void> {
    if (currentUser.role === 'admin') {
      return;
    }

    if (dto.scope === MemoryScope.GLOBAL) {
      throw new ForbiddenException('仅管理员可创建全局记忆');
    }

    if (dto.scope === MemoryScope.USER) {
      if (ownerUserId !== currentUser.userId) {
        throw new ForbiddenException('仅可创建自己的私有记忆');
      }
      return;
    }

    if (dto.scope === MemoryScope.CONVERSATION) {
      if (!dto.sourceConversationId) {
        throw new ForbiddenException('会话记忆必须关联 sourceConversationId');
      }
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: dto.sourceConversationId },
        select: { userId: true },
      });
      if (!conversation || conversation.userId !== currentUser.userId) {
        throw new ForbiddenException('仅可为自己会话创建会话记忆');
      }
    }
  }

  private assertCanForget(memory: Memory, currentUser: JwtUser): void {
    // 普通用户仅可遗忘自己的私有记忆；管理员可遗忘任意记忆。
    if (currentUser.role === 'admin') {
      return;
    }
    if (
      memory.scope !== MemoryScope.USER ||
      memory.ownerUserId !== currentUser.userId
    ) {
      throw new ForbiddenException('无权遗忘该记忆');
    }
  }
}
