import { Injectable, Logger } from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { ChatMessage } from '../ai/types/chat-message.type';
import { PrismaService } from '../prisma/prisma.service';
import { PromptGuardService } from '../security/prompt-guard.service';
import {
  RECENT_COUNT,
  SUMMARY_MAX_CHARS,
  SUMMARY_TRIGGER,
} from './constants';

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly promptGuard: PromptGuardService,
  ) {}

  /**
   * 判断是否需要更新摘要：
   * 总消息数 > SUMMARY_TRIGGER 且存在未纳入 recent 窗口的未摘要消息
   */
  needsSummary(conversation: Conversation, messages: Message[]): boolean {
    if (messages.length <= SUMMARY_TRIGGER) return false;

    const toSummarize = this.getMessagesToSummarize(conversation, messages);
    return toSummarize.length > 0;
  }

  /** 同步生成初始摘要（首次超阈值，阻塞用户请求） */
  async generateInitialSummary(conversationId: number): Promise<void> {
    try {
      await this.updateSummary(conversationId);
    } catch (err) {
      this.logger.warn(
        `初始摘要生成失败 conversationId=${conversationId}`,
        err,
      );
    }
  }

  /** 异步增量摘要，不阻塞用户请求 */
  scheduleSummaryUpdate(conversationId: number): void {
    setImmediate(() => {
      this.updateSummary(conversationId).catch((err) => {
        this.logger.warn(
          `增量摘要更新失败 conversationId=${conversationId}`,
          err,
        );
      });
    });
  }

  private async updateSummary(conversationId: number): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return;

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    const toSummarize = this.getMessagesToSummarize(conversation, messages);
    if (toSummarize.length === 0) return;

    const prompt = this.buildSummaryPrompt(
      conversation.summary,
      toSummarize,
    );

    const reply = await this.aiService.chat([
      { role: 'user', content: prompt },
    ]);

    let summary = reply.response.trim();
    if (!summary) return;

    summary = await this.compressIfNeeded(summary);

    const newSummarizedMessageId = toSummarize[toSummarize.length - 1].id;
    await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [
          { summarizedMessageId: null },
          { summarizedMessageId: { lt: newSummarizedMessageId } },
        ],
      },
      data: {
        summary,
        summarizedMessageId: newSummarizedMessageId,
      },
    });
  }

  /** 取 summarizedMessageId 之后、不在 recent 窗口内的消息 */
  private getMessagesToSummarize(
    conversation: Conversation,
    messages: Message[],
  ): Message[] {
    const unsummarized = messages.filter((m) =>
      conversation.summarizedMessageId
        ? m.id > conversation.summarizedMessageId
        : true,
    );

    if (unsummarized.length <= RECENT_COUNT) return [];

    const recent = unsummarized.slice(-RECENT_COUNT);
    const recentIds = new Set(recent.map((m) => m.id));

    return unsummarized.filter((m) => !recentIds.has(m.id));
  }

  private buildSummaryPrompt(
    existingSummary: string | null,
    messages: Message[],
  ): string {
    const safeSummary = existingSummary
      ? this.promptGuard.sanitizeStoredContent(existingSummary)
      : '';
    const formatted = messages
      .map((m) => {
        const safeContent = this.promptGuard.sanitizeStoredContent(m.content);
        return `[message-${m.id}-begin]\n${m.role}: ${safeContent}\n[message-${m.id}-end]`;
      })
      .join('\n');
    const wrappedDialogue = this.promptGuard.wrapForModel(formatted);

    return `请基于已有摘要与新增对话，输出分层摘要（总长度建议200-400字），保留用户核心问题、结论、偏好、未决问题。
输出必须严格使用以下结构与标题：
【滚动摘要】
...
【主题摘要】
...
【决策与待办】
...
其中“决策与待办”请使用简短条目列出已确认决策和后续待办。

【已有摘要】
${safeSummary || '无'}

【新增对话】
<<<NEW_DIALOGUE_START>>>
${wrappedDialogue}
<<<NEW_DIALOGUE_END>>>`;
  }

  /** 摘要超长时二次压缩 */
  private async compressIfNeeded(summary: string): Promise<string> {
    if (summary.length <= SUMMARY_MAX_CHARS) return summary;

    try {
      const reply = await this.aiService.chat([
        {
          role: 'user',
          content: `请将以下摘要压缩到${SUMMARY_MAX_CHARS}字以内，保留核心信息：\n${summary}`,
        },
      ]);
      return reply.response.trim().slice(0, SUMMARY_MAX_CHARS);
    } catch (err) {
      this.logger.warn('摘要二次压缩失败，直接截断', err);
      return summary.slice(0, SUMMARY_MAX_CHARS);
    }
  }
}
