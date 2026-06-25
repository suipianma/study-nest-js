/** 从用户问题提取检索关键词（中文问句去停用尾缀） */
export function extractQueryKeywords(query: string): string[] {
  const normalized = query
    .replace(/[？?！!。，,；;：:""''（）()\[\]【】\s]+/g, '')
    .trim();
  if (!normalized) return [];

  let core = normalized
    .replace(/(是什么|什么是|是啥|如何|怎么|怎样|为什么|哪些|有没有|请问|吗|呢|啊|的|了)$/g, '')
    .trim();

  if (core.length < 2) {
    core = normalized;
  }

  const keywords = new Set<string>();
  if (core.length >= 2) {
    keywords.add(core);
  }

  // 较长问题再取 4 字滑窗，提高专有名词命中率
  if (core.length > 6) {
    for (let i = 0; i <= core.length - 4; i += 1) {
      keywords.add(core.slice(i, i + 4));
    }
  }

  return [...keywords].sort((a, b) => b.length - a.length).slice(0, 6);
}

/** 关键词在片段中的匹配强度（0~1） */
export function scoreKeywordMatch(content: string, keywords: string[]): number {
  if (!keywords.length) return 0;

  let best = 0;
  for (const keyword of keywords) {
    if (!content.includes(keyword)) continue;
    const density = keyword.length / Math.max(content.length, 1);
    best = Math.max(best, 0.55 + Math.min(density * 4, 0.45));
  }
  return Math.min(best, 1);
}
