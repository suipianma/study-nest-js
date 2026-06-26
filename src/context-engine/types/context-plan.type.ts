import { ContextBlock } from './context-block.type';

export const TRACE_TOKEN_CATEGORIES = [
  'summary',
  'message',
  'rag',
  'tool',
  'memory',
] as const;

export type TraceTokenCategory = (typeof TRACE_TOKEN_CATEGORIES)[number];

export interface ContextBudget {
  maxTokens: number;
  reservedForResponse: number;
  availableForContext: number;
  usedTokens: number;
  categoryTokenUsage: Record<TraceTokenCategory, number>;
}

export interface ContextTraceSnapshot {
  traceId: string;
  selectedBlocks: ContextBlock[];
  droppedBlocks: ContextBlock[];
  budget: ContextBudget;
  categoryTokenUsage: Record<TraceTokenCategory, number>;
  droppedCategories: TraceTokenCategory[];
}

export interface ContextPlan {
  requestId: string;
  traceId: string;
  conversationId: string | number;
  userId: string | number;
  model: string;
  budget: ContextBudget;
  selectedBlocks: ContextBlock[];
  droppedBlocks: ContextBlock[];
  trace: ContextTraceSnapshot[];
}
