import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { resolveModelReply } from '../ai/utils/reply.util';
import { PrismaService } from '../prisma/prisma.service';

const TITLE_MAX_LEN = 20;
const META_TITLE_PATTERNS = [
  /生成.{0,8}标题/,
  /不超过\s*\d+\s*字/,
  /用户让我/,
  /请为以下/,
  /只返回标题/,
  /^嗯[，,]/,
  /^好的[，,]/,
  /^首先/,
];

/** 清洗模型输出，提取可用标题 */
export function pickConversationTitle(
  raw: string,
  fallback: string,
  maxLen = TITLE_MAX_LEN,
): string {
  const candidates = raw
    .split(/\r?\n/)
    .map((line) => sanitizeTitleLine(line))
    .filter(Boolean);

  const merged = sanitizeTitleLine(raw.replace(/\s+/g, ' '));
  if (merged) candidates.push(merged);

  const valid: string[] = [];

  for (const candidate of candidates) {
    if (isValidTitle(candidate, maxLen)) {
      valid.push(candidate);
    }
  }

  if (valid.length > 0) {
    const best = valid.sort((a, b) => b.length - a.length)[0];
    return best.length > maxLen ? `${best.slice(0, maxLen - 1)}…` : best;
  }

  return fallback;
}

function sanitizeTitleLine(line: string): string {
  return line
    .trim()
    .replace(/^["'「『【《]|["'」』】》]$/g, '')
    .replace(/^(标题|题目)[：:]\s*/i, '')
    .replace(/^#+\s*/, '')
    .trim();
}

const PLACEHOLDER_TITLE_PATTERNS = [/^思考中/, /^生成中/, /^输出中/];

function isValidTitle(text: string, maxLen: number): boolean {
  if (!text) return false;
  if (text.length > maxLen + 4) return false;
  if (PLACEHOLDER_TITLE_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  return !META_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

@Injectable()
export class TitleService {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  /** 首条用户消息截断生成初始标题（24 字） */
  truncateTitle(content: string): string {
    return content.length > 24 ? `${content.slice(0, 24)}...` : content;
  }

  /** 首条 AI 回复后异步优化标题，失败或结果异常则保留截断标题 */
  async refineTitle(
    conversationId: number,
    userMsg: string,
    assistantMsg: string,
  ): Promise<void> {
    const fallback = this.truncateTitle(userMsg);

    try {
      const reply = await this.aiService.chat(
        [
          {
            role: 'system',
            content:
              '你是会话标题生成器。根据对话主题输出一个简短中文标题。只输出标题本身，不要解释、不要复述任务、不要输出思考过程。',
          },
          {
            role: 'user',
            content: [
              '根据以下对话生成标题：',
              `用户：${userMsg.slice(0, 120)}`,
              `助手：${assistantMsg.slice(0, 200)}`,
            ].join('\n'),
          },
        ],
        null,
        { skipCache: true },
      );

      const resolved = resolveModelReply(reply.thinking, reply.response);
      const refined = pickConversationTitle(
        resolved.response || resolved.thinking,
        fallback,
      );

      if (refined === fallback) {
        return;
      }

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title: refined },
      });
    } catch {
      // 失败保留截断标题，静默处理
    }
  }
}
