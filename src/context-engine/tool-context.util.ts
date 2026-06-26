import { estimateTokens } from './context-token.util';
import { ContextBlock } from './types/context-block.type';

const TOOL_RESULT_MAX_LEN = 800;

export function compressToolResult(result: string, maxLen = TOOL_RESULT_MAX_LEN): string {
  const trimmed = result.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen)}…（已截断）`;
}

export function formatToolResultContent(toolName: string, result: string): string {
  return `工具 ${toolName} 返回结果：${result}。请根据该结果用自然语言回答用户。`;
}

export function createToolContextBlock(
  toolName: string,
  result: string,
  options: { compress?: boolean; conversationId?: number } = {},
): ContextBlock {
  const normalizedResult = options.compress
    ? compressToolResult(result)
    : result.trim();
  const content = formatToolResultContent(toolName, normalizedResult);

  return {
    id: `tool-${toolName}-round2`,
    type: 'tool',
    role: 'user',
    content,
    priority: 500,
    estimatedTokens: estimateTokens(content),
    source: `tool:${toolName}`,
    metadata: {
      toolName,
      conversationId: options.conversationId,
    },
  };
}
