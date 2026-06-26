import { Conversation, Message } from '@prisma/client';
import { AgentContext, AgentRouteMode } from '../../agent/agent-context.type';
import { ChatMessage } from '../../types/chat-message.type';
import { ContextPlan } from '../../../context-engine/types/context-plan.type';
import { RagChunk } from '../../../knowledge-base/types/rag.type';

export type ExecutionMode = 'direct' | 'agent';

export interface PipelineContext {
  sanitizedContent: string;
  messageContent: string;
  usePrompt: boolean;
  promptId?: string;
  knowledgeBaseIds?: number[];

  conversation: Conversation;
  messages: Message[];
  summary: string | null;

  contextPlan: ContextPlan;
  ollamaMessages: ChatMessage[];
  ragChunks: RagChunk[];

  routeMode: AgentRouteMode;
  executionMode: ExecutionMode;
  agentContext: AgentContext;

  streamId: string;
  isFirstAiReply: boolean;
}

export function createEmptyPipelineContext(): PipelineContext {
  return {
    sanitizedContent: '',
    messageContent: '',
    usePrompt: false,
    conversation: {} as Conversation,
    messages: [],
    summary: null,
    contextPlan: {} as ContextPlan,
    ollamaMessages: [],
    ragChunks: [],
    routeMode: 'direct',
    executionMode: 'direct',
    agentContext: { userId: 0, role: 'user', knowledgeBaseIds: [] },
    streamId: '',
    isFirstAiReply: false,
  };
}
