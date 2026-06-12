import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ApiErrorResponse } from '../interfaces/api-response.interface';
import { normalizeApiMessage } from '../utils/api-message.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message = normalizeApiMessage(exceptionResponse, exception.message);
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    const body: ApiErrorResponse = {
      data: null,
      message,
      code: status,
    };

    this.logger.warn(
      `[user:${request.userId ?? '-'}] ${request.method} ${request.url} ${status} ${typeof message === 'string' ? message : JSON.stringify(message)}`,
    );

    response.status(status).json(body);
  }
}
