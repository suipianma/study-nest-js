import {
  legacyPayloadToEnvelope,
  wrapLegacyPayload,
} from './stream-envelope.util';

describe('stream-envelope.util', () => {
  it('legacyPayloadToEnvelope 应将 rag_citations 转为 v2', () => {
    const env = legacyPayloadToEnvelope({
      phase: 'rag_citations',
      streamId: 's1',
      requestId: 'r1',
      citations: [
        {
          chunkId: 1,
          documentName: 'doc.pdf',
          snippet: 'hello',
          score: 0.9,
        },
      ],
    });

    expect(env).toMatchObject({
      v: 2,
      type: 'rag_citations',
      streamId: 's1',
      requestId: 'r1',
      payload: { citations: expect.any(Array) },
    });
  });

  it('legacyPayloadToEnvelope 应将 message delta 转为 v2', () => {
    const env = legacyPayloadToEnvelope({
      streamId: 's1',
      contentDelta: 'hi',
    });

    expect(env?.type).toBe('message_delta');
    expect(env?.payload).toMatchObject({ contentDelta: 'hi' });
  });

  it('wrapLegacyPayload 无法识别时返回原 payload', () => {
    const raw = { unknown: true };
    expect(wrapLegacyPayload(raw as any)).toEqual(raw);
  });
});
