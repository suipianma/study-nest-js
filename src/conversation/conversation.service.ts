import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_MESSAGES, MESSAGE_PAGE_SIZE } from './constants';
import {
  buildDailyTokenTrend,
  resolveMessageTokens,
  type TokenDailyPoint,
} from './utils/token.util';

export interface MessagesPageResult {
  items: Message[];
  hasMore: boolean;
  total: number;
}

export interface TokenUsageStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  todayTokens: number;
  aiReplyCount: number;
  cachedReplyCount: number;
  conversationCount: number;
  hasEstimated: boolean;
  dailyTrend: TokenDailyPoint[];
}

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 按更新时间倒序获取用户会话列表 */
  findAllByUser(userId: number): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 新建空会话 */
  create(userId: number): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: { userId, title: '新对话' },
    });
  }

  /** 重命名会话 */
  async updateTitle(
    id: number,
    userId: number,
    title: string,
  ): Promise<Conversation> {
    await this.findOneOrFail(id, userId);
    return this.prisma.conversation.update({
      where: { id },
      data: { title },
    });
  }

  /** 删除会话（级联删除消息） */
  async remove(id: number, userId: number): Promise<Conversation> {
    await this.findOneOrFail(id, userId);
    return this.prisma.conversation.delete({ where: { id } });
  }

  /** 获取会话，不存在 404，非本人 403 */
  async findOneOrFail(id: number, userId: number): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('无权访问此会话');
    }

    return conversation;
  }

  /** 获取会话消息列表（校验归属） */
  async getMessages(
    conversationId: number,
    userId: number,
  ): Promise<Message[]> {
    const page = await this.getMessagesPaginated(conversationId, userId, {
      limit: MAX_MESSAGES,
    });
    return page.items;
  }

  /**
   * 分页获取消息
   * - 无 beforeId：最新 limit 条（升序返回）
   * - 有 beforeId：该 id 之前更早的 limit 条（升序返回）
   */
  async getMessagesPaginated(
    conversationId: number,
    userId: number,
    options: { limit?: number; beforeId?: number } = {},
  ): Promise<MessagesPageResult> {
    await this.findOneOrFail(conversationId, userId);

    const limit = Math.min(
      Math.max(options.limit ?? MESSAGE_PAGE_SIZE, 1),
      MAX_MESSAGES,
    );
    const total = await this.countMessages(conversationId);

    if (options.beforeId) {
      const older = await this.prisma.message.findMany({
        where: { conversationId, id: { lt: options.beforeId } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      const items = older.reverse();
      const hasMore =
        items.length > 0
          ? (await this.prisma.message.count({
              where: {
                conversationId,
                id: { lt: items[0].id },
              },
            })) > 0
          : false;

      return { items, hasMore, total };
    }

    const latest = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const items = latest.reverse();

    return {
      items,
      hasMore: total > items.length,
      total,
    };
  }

  countMessages(conversationId: number): Promise<number> {
    return this.prisma.message.count({ where: { conversationId } });
  }

  createUserMessage(
    conversationId: number,
    content: string,
  ): Promise<Message> {
    return this.prisma.message.create({
      data: { conversationId, role: 'user', content },
    });
  }

  createAssistantMessage(
    conversationId: number,
    data: {
      content: string;
      thinking?: string;
      fromCache?: boolean;
      promptTokens?: number;
      completionTokens?: number;
    },
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: data.content,
        thinking: data.thinking,
        fromCache: data.fromCache ?? false,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
      },
    });
  }

  /** 聚合当前用户 AI 对话 token 消耗 */
  async getTokenUsageStats(userId: number): Promise<TokenUsageStats> {
    const conversations = await this.prisma.conversation.findMany({
      where: { userId },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);

    if (conversationIds.length === 0) {
      return {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        todayTokens: 0,
        aiReplyCount: 0,
        cachedReplyCount: 0,
        conversationCount: 0,
        hasEstimated: false,
        dailyTrend: buildDailyTokenTrend([]),
      };
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const assistantMessages = await this.prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        role: 'assistant',
      },
      select: {
        role: true,
        promptTokens: true,
        completionTokens: true,
        content: true,
        thinking: true,
        fromCache: true,
        createdAt: true,
      },
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let todayTokens = 0;
    let cachedReplyCount = 0;
    let hasEstimated = false;

    for (const message of assistantMessages) {
      const resolved = resolveMessageTokens(message);
      promptTokens += resolved.prompt;
      completionTokens += resolved.completion;
      if (resolved.estimated) hasEstimated = true;
      if (message.fromCache) cachedReplyCount += 1;

      if (message.createdAt >= startOfToday) {
        todayTokens += resolved.prompt + resolved.completion;
      }
    }

    return {
      totalTokens: promptTokens + completionTokens,
      promptTokens,
      completionTokens,
      todayTokens,
      aiReplyCount: assistantMessages.length,
      cachedReplyCount,
      conversationCount: conversationIds.length,
      hasEstimated,
      dailyTrend: buildDailyTokenTrend(assistantMessages),
    };
  }

  /** 消息数达上限时拒绝发送 */
  async assertMessageLimit(conversationId: number): Promise<void> {
    const count = await this.countMessages(conversationId);
    if (count >= MAX_MESSAGES) {
      throw new BadRequestException('会话消息已达上限，请新建会话');
    }
  }

  /** 更新会话 updatedAt */
  touchUpdatedAt(conversationId: number): Promise<Conversation> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  /** 更新会话标题 */
  updateTitleDirect(
    conversationId: number,
    title: string,
  ): Promise<Conversation> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }
}
