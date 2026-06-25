import { Injectable } from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { ChatMessage } from '../ai/types/chat-message.type';
import { RagChunk } from '../knowledge-base/types/rag.type';
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
    options?: {
      injectPrompt?: boolean;
      promptId?: string;
      ragChunks?: RagChunk[];
      ragEnabled?: boolean;
      ragUnavailable?: boolean;
    },
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

    const ragSystem = this.resolveRagSystem(options);
    if (ragSystem) {
      result.push({
        role: 'system',
        content: ragSystem,
      });
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

  private resolveRagSystem(
    options?: {
      ragChunks?: RagChunk[];
      ragEnabled?: boolean;
      ragUnavailable?: boolean;
    },
  ): string | undefined {
    if (!options) return undefined;
    if (options.ragUnavailable) return this.buildRagUnavailableSystem();
    if (options.ragChunks?.length) return this.buildRagSystem(options.ragChunks);
    if (options.ragEnabled) return this.buildRagEmptySystem();
    return undefined;
  }

  private buildRagSystem(chunks: RagChunk[]): string {
    const refs = chunks
      .map((chunk, index) => {
        const pageLabel = chunk.page ? `第${chunk.page}页` : '';
        return `【资料${index + 1}】来源：《${chunk.documentName}》${pageLabel}\n内容：${chunk.content}`;
      })
      .join('\n\n');

    return [
      '以下是与用户问题相关的参考资料。请仅根据资料回答；资料未提及则说明「知识库中未找到相关信息」，不要编造。',
      '',
      refs,
      '',
      '回答要求：',
      '1. 仅当资料内容与用户问题为同一主题时再回答；若主题不符（如问聘用却给了考核内容），必须回答「知识库中未找到相关信息」',
      '2. 优先引用资料原文',
      '3. 在句末标注来源，如 [资料1]',
      '4. 资料冲突时说明冲突并列出各方说法',
    ].join('\n');
  }

  private buildRagEmptySystem(): string {
    return [
      '用户已选择知识库，但本次检索未找到与问题相关的资料。',
      '请明确告知「知识库中未找到相关信息」，不要编造。',
    ].join('\n');
  }

  private buildRagUnavailableSystem(): string {
    return [
      '用户已启用知识库检索，但检索服务暂时不可用。',
      '请继续完成回答，并明确提示“知识库检索暂不可用”。',
    ].join('\n');
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
    let content = m.content;

    // 发给模型时去掉【模板名】前缀，避免小模型复读展示文案
    if (m.role === 'user' && /^【[^】]+】/.test(content)) {
      const parsed = this.promptTemplateService.parseContextFromUserMessage(content);
      if (parsed) content = parsed;
    }

    if (m.role === 'assistant' && m.thinking) {
      content = `${m.thinking}\n${m.content}`;
    }

    return {
      role: m.role as 'user' | 'assistant',
      content,
    };
  }
}
