import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  USER_ID_HEADER,
  resolveUserId,
} from '../utils/user-context.util';

@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const queryUserId =
      typeof req.query.userId === 'string' ? req.query.userId : undefined;

    const userId = resolveUserId({
      headerValue: req.headers[USER_ID_HEADER],
      queryValue: queryUserId,
      authorization: req.headers.authorization,
    });

    req.userId = userId;
    next();
  }
}
