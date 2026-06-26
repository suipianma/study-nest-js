import { Injectable } from '@nestjs/common';

export interface ModerationResult {
  /** 是否允许展示（false 时用 replacement 全文替换） */
  allowed: boolean;
  text: string;
}

/** 输出内容安全审核（敏感词 + 基础 PII 脱敏） */
@Injectable()
export class ContentModerationService {
  /** 命中则整段回复替换为安全提示，不暴露命中词 */
  private readonly blockKeywords = [
    '制作炸弹',
    '恐怖袭击',
    '贩卖毒品',
    '自杀方法',
  ];

  private readonly maskRules: Array<{
    pattern: RegExp;
    replace: (value: string) => string;
  }> = [
    {
      // 中国大陆手机号脱敏
      pattern: /\b1[3-9]\d{9}\b/g,
      replace: (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`,
    },
    {
      // 18 位身份证号脱敏
      pattern: /\b\d{17}[\dXx]\b/g,
      replace: (id) => `${id.slice(0, 4)}**********${id.slice(-4)}`,
    },
  ];

  moderate(text: string): ModerationResult {
    const normalized = text.trim();
    if (!normalized) {
      return { allowed: true, text: normalized };
    }

    const lower = normalized.toLowerCase();
    for (const keyword of this.blockKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return {
          allowed: false,
          text: '抱歉，我无法提供该内容的回复。如有其他问题，欢迎继续提问。',
        };
      }
    }

    let masked = normalized;
    for (const rule of this.maskRules) {
      masked = masked.replace(rule.pattern, (match) => rule.replace(match));
    }

    return { allowed: true, text: masked };
  }
}
