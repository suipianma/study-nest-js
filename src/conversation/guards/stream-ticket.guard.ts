import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { StreamTicketService } from '../stream-ticket.service';

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
      return true;
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

/** ticket 已注入 user 时跳过 JWT 校验 */
@Injectable()
export class JwtUnlessUserGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (request.user) {
      return true;
    }
    return super.canActivate(context) as boolean | Promise<boolean>;
  }
}
