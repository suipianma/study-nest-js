import { Injectable } from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { ChatMessage } from '../ai/types/chat-message.type';
import { RECENT_COUNT, SUMMARY_TRIGGER } from './constants';

@Injectable()
export class ContextBuilderService {
  /** 按 spec 组装发给模型的 messages */
  build(conversation: Conversation, dbMessages: Message[]): ChatMessage[] {
    if (dbMessages.length <= SUMMARY_TRIGGER) {
      return dbMessages.map((m) => this.toChatMessage(m));
    }

    // 摘要模式：取 summarizedMessageId 之后的近期消息
    const unsummarized = dbMessages.filter((m) =>
      conversation.summarizedMessageId
        ? m.id > conversation.summarizedMessageId
        : true,
    );
    const recent = unsummarized.slice(-RECENT_COUNT);

    const result: ChatMessage[] = [];
    result.push({
      role: 'system',
      content: `历史对话摘要：\n${conversation.summary ?? '（暂无）'}`,
    });

    recent.forEach((m) => {
      result.push(this.toChatMessage(m));
    });

    return result;
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
