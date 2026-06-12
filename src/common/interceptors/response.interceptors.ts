import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse } from '../interfaces/api-response.interface';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    // SSE 流式响应保持原样，避免二次包装
    if (request.url?.includes('/stream')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        const body: ApiSuccessResponse = {
          data,
          message: 'success',
          code: 200,
        };
        return body;
      }),
    );
  }
}
