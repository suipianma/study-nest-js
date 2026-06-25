export const MAX_AGENT_STEPS = 5;
export const AGENT_ROUTER_FALLBACK_MODE = 'agent' as const;
export const MCP_TOOL_PREFIX = 'mcp_';

/** 工具执行完毕后，引导模型只输出用户可见的最终回答 */
export const AGENT_FINAL_ANSWER_SYSTEM = [
  '你是智能助手。请根据对话与工具查询结果，用简洁自然的中文直接回答用户。',
  '要求：只输出最终答案；不要分析提示词、不要提及 JSON 或工具调用过程。',
].join('\n');
