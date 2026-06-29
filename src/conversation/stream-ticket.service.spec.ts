import { UnauthorizedException } from '@nestjs/common';
import { StreamTicketService } from './stream-ticket.service';

describe('StreamTicketService', () => {
  const redisStore = new Map<string, string>();
  const redis = {
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn((key: string) =>
      Promise.resolve(redisStore.get(key) ?? null),
    ),
    del: jest.fn((key: string) => {
      redisStore.delete(key);
      return Promise.resolve(1);
    }),
  };

  let service: StreamTicketService;

  beforeEach(() => {
    redisStore.clear();
    jest.clearAllMocks();
    service = new StreamTicketService({ redis } as any);
  });

  it('createTicket 应写入 Redis 并返回 ticket', async () => {
    const result = await service.createTicket(42, 100);

    expect(result.ticket).toBeTruthy();
    expect(result.expiresIn).toBe(120);
    expect(redis.set).toHaveBeenCalledWith(
      `stream-ticket:${result.ticket}`,
      expect.any(String),
      'EX',
      120,
    );
  });

  it('resolveTicket 成功应返回 userId 并删除 ticket（一次性）', async () => {
    const { ticket } = await service.createTicket(7, 55);

    const resolved = await service.resolveTicket(ticket, 7);
    expect(resolved.userId).toBe(55);

    await expect(service.resolveTicket(ticket, 7)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('conversationId 不匹配应拒绝', async () => {
    const { ticket } = await service.createTicket(1, 10);

    await expect(service.resolveTicket(ticket, 2)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('过期 ticket 应拒绝', async () => {
    const { ticket } = await service.createTicket(1, 10);
    const key = `stream-ticket:${ticket}`;
    const raw = redisStore.get(key);
    expect(raw).toBeTruthy();

    const payload = JSON.parse(raw!) as {
      userId: number;
      conversationId: number;
      exp: number;
    };
    payload.exp = Date.now() - 1000;
    redisStore.set(key, JSON.stringify(payload));

    await expect(service.resolveTicket(ticket, 1)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
