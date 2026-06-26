import { BadRequestException } from '@nestjs/common';

export function parseKnowledgeBaseIds(
  raw: string | string[] | undefined,
): number[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const segments = (Array.isArray(raw) ? raw : [raw]).flatMap((item) => {
    const trimmed = item.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((value) => String(value));
        }
      } catch {
        throw new BadRequestException('knowledgeBaseIds 参数格式错误');
      }
    }
    return trimmed.split(',');
  });

  if (segments.length === 0) {
    return undefined;
  }

  const parsedIds = segments.map((segment) => {
    const value = Number(segment.trim());
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException('knowledgeBaseIds 必须为正整数数组');
    }
    return value;
  });

  return [...new Set(parsedIds)];
}
