import { RagCitation } from '../../knowledge-base/types/rag.type';
import {
  StreamEventEnvelope,
  StreamEventType,
} from '../types/stream-event-envelope.type';

export interface LegacyStreamPayload {
  thinking?: string;
  response?: string;
  thinkingDelta?: string;
  contentDelta?: string;
  done?: boolean;
  fromCache?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  phase?:
    | 'tool_call'
    | 'tool_result'
    | 'agent_start'
    | 'agent_step'
    | 'agent_done'
    | 'rag_citations';
  tool?: string;
  args?: Record<string, string>;
  result?: string;
  error?: string;
  streamId?: string;
  requestId?: string;
  toolCallId?: string;
  step?: number;
  maxSteps?: number;
  steps?: number;
  seq?: number;
  citations?: RagCitation[];
}

function baseMeta(payload: LegacyStreamPayload) {
  return {
    streamId: payload.streamId,
    requestId: payload.requestId,
    seq: payload.seq,
    ts: Date.now(),
  };
}

function envelope<T extends Record<string, unknown>>(
  type: StreamEventType,
  payload: T,
  meta: ReturnType<typeof baseMeta>,
): StreamEventEnvelope<T> {
  return { v: 2, type, payload, ...meta };
}

/** 将旧版扁平 payload 转为 v2 信封；无法识别时返回 null */
export function legacyPayloadToEnvelope(
  payload: LegacyStreamPayload,
): StreamEventEnvelope | null {
  const meta = baseMeta(payload);

  if (payload.phase === 'rag_citations' && payload.citations) {
    return envelope('rag_citations', { citations: payload.citations }, meta);
  }

  if (payload.phase === 'tool_call' && payload.tool && payload.args) {
    return envelope(
      'tool_call',
      {
        tool: payload.tool,
        args: payload.args,
        step: payload.step,
        toolCallId: payload.toolCallId,
      },
      meta,
    );
  }

  if (payload.phase === 'tool_result' && payload.tool) {
    return envelope(
      'tool_result',
      {
        tool: payload.tool,
        result: payload.result ?? '',
        error: payload.error,
        step: payload.step,
        toolCallId: payload.toolCallId,
      },
      meta,
    );
  }

  if (
    payload.phase === 'agent_start' ||
    payload.phase === 'agent_step' ||
    payload.phase === 'agent_done'
  ) {
    return envelope(
      'agent_step',
      {
        phase: payload.phase,
        step: payload.step,
        maxSteps: payload.maxSteps,
        steps: payload.steps,
      },
      meta,
    );
  }

  if (payload.error) {
    return envelope('stream_error', { error: payload.error }, meta);
  }

  if (payload.done) {
    return envelope(
      'stream_done',
      {
        thinking: payload.thinking,
        response: payload.response,
        fromCache: payload.fromCache,
        promptTokens: payload.promptTokens,
        completionTokens: payload.completionTokens,
      },
      meta,
    );
  }

  const hasDelta =
    payload.thinkingDelta ||
    payload.contentDelta ||
    payload.thinking !== undefined ||
    payload.response !== undefined;

  if (hasDelta) {
    return envelope(
      'message_delta',
      {
        thinkingDelta: payload.thinkingDelta,
        contentDelta: payload.contentDelta,
        thinking: payload.thinking,
        response: payload.response,
        fromCache: payload.fromCache,
        promptTokens: payload.promptTokens,
        completionTokens: payload.completionTokens,
      },
      meta,
    );
  }

  if (payload.streamId || payload.requestId) {
    return envelope('stream_meta', {}, meta);
  }

  return null;
}

export function wrapLegacyPayload(
  payload: LegacyStreamPayload,
): StreamEventEnvelope | LegacyStreamPayload {
  const wrapped = legacyPayloadToEnvelope(payload);
  return wrapped ?? payload;
}
