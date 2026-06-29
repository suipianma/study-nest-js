export interface PipelineInput {
  conversationId: number;
  userId: number;
  role: string;
  content: string;
  promptId?: string;
  knowledgeBaseIds?: number[];
  isRegenerate?: boolean;
  model?: string;
}
