/** SSE v2 统一事件信封 */
export type StreamEventType =
  | 'stream_meta'
  | 'message_delta'
  | 'tool_call'
  | 'tool_result'
  | 'agent_step'
  | 'rag_citations'
  | 'stream_done'
  | 'stream_error';

export interface StreamEventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  v: 2;
  type: StreamEventType;
  payload: T;
  streamId?: string;
  requestId?: string;
  seq?: number;
  ts: number;
}
