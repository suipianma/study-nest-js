import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

/**
 * SSE 场景 EventSource 无法带 Authorization header，
 * 从 query.token 注入 Bearer token 供 AuthGuard('jwt') 使用
 */
@Injectable()
export class JwtQueryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.query.token;

    if (
      typeof token === 'string' &&
      token.trim() &&
      !request.headers.authorization
    ) {
      request.headers.authorization = `Bearer ${token.trim()}`;
    }

    return true;
  }
}
