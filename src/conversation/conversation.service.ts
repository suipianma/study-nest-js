import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_MESSAGES } from './constants';

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
    await this.findOneOrFail(conversationId, userId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
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
