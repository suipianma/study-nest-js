import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';

const TICKET_TTL_SECONDS = 120;

interface StreamTicketPayload {
  userId: number;
  conversationId: number;
  exp: number;
}

@Injectable()
export class StreamTicketService {
  constructor(private readonly redisService: RedisService) {}

  async createTicket(
    conversationId: number,
    userId: number,
  ): Promise<{ ticket: string; expiresIn: number }> {
    const ticket = randomUUID();
    const payload: StreamTicketPayload = {
      userId,
      conversationId,
      exp: Date.now() + TICKET_TTL_SECONDS * 1000,
    };

    await this.redisService.redis.set(
      this.key(ticket),
      JSON.stringify(payload),
      'EX',
      TICKET_TTL_SECONDS,
    );

    return { ticket, expiresIn: TICKET_TTL_SECONDS };
  }

  async resolveTicket(
    ticket: string,
    conversationId: number,
  ): Promise<{ userId: number }> {
    const raw = await this.redisService.redis.get(this.key(ticket));
    if (!raw) {
      throw new UnauthorizedException('流式 ticket 无效或已过期');
    }

    const payload = JSON.parse(raw) as StreamTicketPayload;
    if (
      payload.conversationId !== conversationId ||
      payload.exp < Date.now()
    ) {
      throw new UnauthorizedException('流式 ticket 无效或已过期');
    }

    await this.redisService.redis.del(this.key(ticket));
    return { userId: payload.userId };
  }

  private key(ticket: string): string {
    return `stream-ticket:${ticket}`;
  }
}
