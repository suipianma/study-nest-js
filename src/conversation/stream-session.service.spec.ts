import { StreamSessionService } from './stream-session.service';

describe('StreamSessionService', () => {
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    multi: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    redis.multi.mockReturnValue({
      set: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });
  });

  it('creates active session with generating status', async () => {
    const service = new StreamSessionService({ redis } as any);
    const session = await service.createSession({
      conversationId: 9,
      userId: 3,
      userMessageContent: 'hello',
      isFirstAiReply: true,
    });

    expect(session.status).toBe('generating');
    expect(session.conversationId).toBe(9);
    expect(redis.multi).toHaveBeenCalled();
  });

  it('returns null when active session is not generating', async () => {
    redis.get.mockResolvedValueOnce('stream-1');
    redis.get.mockResolvedValueOnce(
      JSON.stringify({
        streamId: 'stream-1',
        conversationId: 9,
        userId: 3,
        status: 'completed',
        thinking: '',
        response: 'done',
        seq: 2,
        fromCache: false,
        userMessageContent: 'hello',
        isFirstAiReply: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const service = new StreamSessionService({ redis } as any);
    const active = await service.getActiveSession(9, 3);
    expect(active).toBeNull();
  });
});
