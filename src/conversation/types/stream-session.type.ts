export type StreamSessionStatus =
  | 'generating'
  | 'completed'
  | 'failed'
  | 'interrupted';

export interface StreamSession {
  streamId: string;
  conversationId: number;
  userId: number;
  status: StreamSessionStatus;
  thinking: string;
  response: string;
  seq: number;
  fromCache: boolean;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
  userMessageContent: string;
  isFirstAiReply: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StreamSessionSnapshot {
  streamId: string;
  conversationId: number;
  status: StreamSessionStatus;
  thinking: string;
  response: string;
  seq: number;
  fromCache: boolean;
  error?: string;
  done: boolean;
}
