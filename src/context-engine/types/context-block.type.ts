export type ContextBlockType =
  | 'system'
  | 'policy'
  | 'prompt'
  | 'summary'
  | 'message'
  | 'rag'
  | 'tool'
  | 'memory';

export type ContextRole = 'system' | 'user' | 'assistant';

export interface ContextBlockMetadata {
  conversationId?: string | number;
  messageId?: string | number;
  memoryId?: string | number;
  scope?: string;
  knowledgeBaseId?: string | number;
  documentName?: string;
  toolName?: string;
  hasAssistantThinking?: boolean;
  mustKeep?: boolean;
  category?: string;
}

export interface ContextBlock {
  id: string;
  type: ContextBlockType;
  role: ContextRole;
  content: string;
  priority: number;
  estimatedTokens: number;
  source: string;
  metadata?: ContextBlockMetadata;
}
