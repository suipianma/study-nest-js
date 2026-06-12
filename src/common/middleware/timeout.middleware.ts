import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DEFAULT_HTTP_TIMEOUT_MS } from '../constants/api.constant';

@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    // SSE 流式接口不做全局 HTTP 超时限制
    if (req.path.includes('/stream')) {
      next();
      return;
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        this.logger.warn(
          `[user:${req.userId ?? '-'}] ${req.method} ${req.url} 408 请求超时`,
        );
        res.status(408).json({
          data: null,
          message: '请求超时',
          code: 408,
        });
      }
    }, DEFAULT_HTTP_TIMEOUT_MS);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  }
}
