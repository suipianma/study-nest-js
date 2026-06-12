export const TOKEN_TREND_DAYS = 7;

export interface TokenDailyPoint {
  date: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

/** 格式化为本地日期键 YYYY-MM-DD */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 生成最近 N 天的日期键（含今天） */
export function buildLastNDayKeys(days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    keys.push(formatLocalDateKey(date));
  }
  return keys;
}

type AssistantMessageForTrend = {
  role: string;
  promptTokens: number | null;
  completionTokens: number | null;
  content: string;
  thinking: string | null;
  fromCache: boolean;
  createdAt: Date;
};

/** 按日聚合 token 消耗，缺失日期补 0 */
export function buildDailyTokenTrend(
  messages: AssistantMessageForTrend[],
  days = TOKEN_TREND_DAYS,
): TokenDailyPoint[] {
  const dayKeys = buildLastNDayKeys(days);
  const bucketMap = new Map(
    dayKeys.map((date) => [date, { prompt: 0, completion: 0 }]),
  );

  for (const message of messages) {
    const dateKey = formatLocalDateKey(message.createdAt);
    const bucket = bucketMap.get(dateKey);
    if (!bucket) continue;

    const resolved = resolveMessageTokens(message);
    bucket.prompt += resolved.prompt;
    bucket.completion += resolved.completion;
  }

  return dayKeys.map((date) => {
    const bucket = bucketMap.get(date)!;
    return {
      date,
      promptTokens: bucket.prompt,
      completionTokens: bucket.completion,
      totalTokens: bucket.prompt + bucket.completion,
    };
  });
}

/** 历史消息无 token 记录时的粗略估算（中文为主约 3 字符/token） */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3);
}

export function resolveMessageTokens(message: {
  role: string;
  promptTokens: number | null;
  completionTokens: number | null;
  content: string;
  thinking: string | null;
  fromCache: boolean;
}): { prompt: number; completion: number; estimated: boolean } {
  if (message.role !== 'assistant') {
    return { prompt: 0, completion: 0, estimated: false };
  }

  if (message.fromCache) {
    return { prompt: 0, completion: 0, estimated: false };
  }

  const hasRecorded =
    message.promptTokens != null || message.completionTokens != null;

  if (hasRecorded) {
    return {
      prompt: message.promptTokens ?? 0,
      completion: message.completionTokens ?? 0,
      estimated: false,
    };
  }

  const text = `${message.content}${message.thinking ?? ''}`;
  const estimated = estimateTokensFromText(text);
  return { prompt: 0, completion: estimated, estimated: true };
}
