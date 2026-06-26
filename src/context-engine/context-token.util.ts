export function estimateTokens(content: string): number {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return 0;
  }

  return Math.ceil(normalizedContent.length / 3);
}
