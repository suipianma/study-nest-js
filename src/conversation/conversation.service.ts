import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_MESSAGES, MESSAGE_PAGE_SIZE } from './constants';

export interface MessagesPageResult {
  items: Message[];
  hasMore: boolean;
  total: number;
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
    data: { content: string; thinking?: string; fromCache?: boolean },
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: data.content,
        thinking: data.thinking,
        fromCache: data.fromCache ?? false,
      },
    });
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
