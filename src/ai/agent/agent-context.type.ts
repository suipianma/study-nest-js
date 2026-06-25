export interface AgentContext {
  userId: number;
  role: string;
  knowledgeBaseIds: number[];
}

export type AgentRouteMode = 'direct' | 'agent';
