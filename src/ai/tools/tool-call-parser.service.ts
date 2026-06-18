import { Injectable } from '@nestjs/common';
import { ToolCall } from './types/tool.type';

@Injectable()
export class ToolCallParserService {
  /** 从模型输出中解析工具调用 JSON */
  parse(text: string, knownTools: Set<string>): ToolCall | null {
    const cleaned = this.stripThinkTags(text);
    if (!cleaned) return null;

    const jsonText = this.extractJson(cleaned);
    if (!jsonText) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== 'object') return null;

    const record = parsed as Record<string, unknown>;
    const tool = record.tool;
    if (typeof tool !== 'string' || !knownTools.has(tool)) return null;

    const args: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === 'tool') continue;
      if (value == null) continue;
      args[key] = String(value).trim();
    }

    return { tool, args, raw: jsonText };
  }

  private stripThinkTags(text: string): string {
    const closeTag = '</' + 'think>';
    const closeIndex = text.indexOf(closeTag);
    if (closeIndex !== -1) {
      return text.slice(closeIndex + closeTag.length).trim();
    }
    return text.trim();
  }

  private extractJson(text: string): string | null {
    const direct = text.trim();
    if (direct.startsWith('{') && direct.endsWith('}')) {
      return direct;
    }

    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fenced?.[1]) {
      const inner = fenced[1].trim();
      if (inner.startsWith('{')) return inner;
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return text.slice(start, end + 1);
    }

    return null;
  }
}
