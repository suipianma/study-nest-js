import { Injectable } from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { ChatMessage } from '../ai/types/chat-message.type';
import { RECENT_COUNT, SUMMARY_TRIGGER } from './constants';

@Injectable()
export class ContextBuilderService {
  constructor(
    private readonly promptTemplateService: PromptTemplateService,
  ) {}

  /** 按 spec 组装发给模型的 messages；仅当 injectPrompt 为 true 时注入模板 system */
  build(
    conversation: Conversation,
    dbMessages: Message[],
    options?: { injectPrompt?: boolean; promptId?: string },
  ): ChatMessage[] {
    const result: ChatMessage[] = [];

    if (options?.injectPrompt && options.promptId) {
      const template = this.promptTemplateService.findById(options.promptId);
      if (template) {
        const context = this.resolvePromptContext(dbMessages);
        result.push({
          role: 'system',
          content: this.promptTemplateService.buildSystemPrompt(
            template,
            context,
          ),
        });
      }
    }

    if (dbMessages.length <= SUMMARY_TRIGGER) {
      dbMessages.forEach((m) => result.push(this.toChatMessage(m)));
      return result;
    }

    // 摘要模式：取 summarizedMessageId 之后的近期消息
    const unsummarized = dbMessages.filter((m) =>
      conversation.summarizedMessageId
        ? m.id > conversation.summarizedMessageId
        : true,
    );
    const recent = unsummarized.slice(-RECENT_COUNT);

    result.push({
      role: 'system',
      content: `历史对话摘要：\n${conversation.summary ?? '（暂无）'}`,
    });

    recent.forEach((m) => {
      result.push(this.toChatMessage(m));
    });

    return result;
  }

  /** 优先从带【模板名】的首条消息取 Context，否则用最近一条用户消息 */
  private resolvePromptContext(dbMessages: Message[]): string {
    const tagged = dbMessages.find(
      (m) => m.role === 'user' && /^【[^】]+】/.test(m.content),
    );
    if (tagged) {
      return this.promptTemplateService.parseContextFromUserMessage(
        tagged.content,
      );
    }
    const lastUser = [...dbMessages].reverse().find((m) => m.role === 'user');
    return lastUser?.content.trim() ?? '';
  }

  private toChatMessage(m: Message): ChatMessage {
    return {
      role: m.role as 'user' | 'assistant',
      content:
        m.role === 'assistant' && m.thinking
          ? `${m.thinking}\n${m.content}`
          : m.content,
    };
  }
}
