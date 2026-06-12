import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TitleService {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  /** 首条用户消息截断生成初始标题（24 字） */
  truncateTitle(content: string): string {
    return content.length > 24 ? content.slice(0, 24) + '...' : content;
  }

  /** 首条 AI 回复后异步优化标题，失败静默保留截断标题 */
  async refineTitle(
    conversationId: number,
    userMsg: string,
    assistantMsg: string,
  ): Promise<void> {
    try {
      const reply = await this.aiService.chat([
        {
          role: 'user',
          content: `请为以下对话生成一个不超过20字的标题，只返回标题文字：\n用户：${userMsg}\n助手：${assistantMsg}`,
        },
      ]);

      const refined = reply.response.slice(0, 20).trim();
      if (refined) {
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { title: refined },
        });
      }
    } catch {
      // 失败保留截断标题，静默处理
    }
  }
}
