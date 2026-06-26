import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Memory, MemoryScope, Prisma } from '@prisma/client';
import { JwtUser } from '../knowledge-base/knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { estimateTokens } from './context-token.util';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { SearchMemoryDto } from './dto/search-memory.dto';
import { ContextBlock } from './types/context-block.type';

@Injectable()
export class ContextMemoryService {
  // 记忆与历史消息（priority=100）同场竞争：高重要度记忆可优先保留。
  private readonly memoryBasePriority = 80;
  private readonly memoryImportanceStep = 4;

  constructor(private readonly prisma: PrismaService) {}

  async createMemory(dto: CreateMemoryDto, currentUser: JwtUser): Promise<Memory> {
    const ownerUserId = dto.ownerUserId ?? currentUser.userId;
    await this.assertCanCreate(dto, ownerUserId, currentUser);

    return this.prisma.memory.create({
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
  }

  searchMemories(query: SearchMemoryDto, currentUser: JwtUser): Promise<Memory[]> {
    const where = this.buildSearchWhere(query, currentUser);
    return this.prisma.memory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: query.limit ?? 10,
    });
  }

  async forgetMemory(id: number, currentUser: JwtUser): Promise<Memory> {
    const memory = await this.prisma.memory.findUnique({ where: { id } });
    if (!memory) {
      throw new NotFoundException('记忆不存在');
    }

    this.assertCanForget(memory, currentUser);
    return this.prisma.memory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
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
