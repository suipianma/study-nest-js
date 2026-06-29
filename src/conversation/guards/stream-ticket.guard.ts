import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { StreamTicketService } from '../stream-ticket.service';

/** SSE 仅允许一次性 stream ticket 鉴权（不再支持 URL token 回退） */
@Injectable()
export class StreamTicketGuard implements CanActivate {
  constructor(private readonly streamTicketService: StreamTicketService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: { userId: number; username: string; role: string } }
    >();

    const ticket = request.query.ticket;
    const conversationId = Number(request.params.id);

    if (
      typeof ticket !== 'string' ||
      !ticket.trim() ||
      !Number.isFinite(conversationId)
    ) {
      throw new UnauthorizedException('缺少有效的流式 ticket');
    }

    const resolved = await this.streamTicketService.resolveTicket(
      ticket.trim(),
      conversationId,
    );
    request.user = {
      userId: resolved.userId,
      username: '',
      role: 'user',
    };
    return true;
  }
}
