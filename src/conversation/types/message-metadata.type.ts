export interface MessageToolCallMeta {
  tool: string;
  args: Record<string, string>;
  result?: string;
  status: 'calling' | 'done' | 'error';
  toolCallId?: string;
}

export interface MessageAgentStepMeta {
  type: 'start' | 'step' | 'tool_call' | 'tool_result' | 'done';
  step?: number;
  maxSteps?: number;
  totalSteps?: number;
  tool?: string;
  args?: Record<string, string>;
  result?: string;
}

export interface MessageCitationMeta {
  chunkId: number;
  documentName: string;
  page?: number | null;
  snippet: string;
  score: number;
}

export interface MessageMetadata {
  toolCalls?: MessageToolCallMeta[];
  agentSteps?: MessageAgentStepMeta[];
  citations?: MessageCitationMeta[];
  feedback?: 'up' | 'down';
}
