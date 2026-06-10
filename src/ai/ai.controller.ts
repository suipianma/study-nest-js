import { Controller, Sse } from '@nestjs/common';
import { interval, map, Observable } from 'rxjs';

@Controller('ai')
export class AiController {
  @Sse('stream')
  stream() {
    return interval(1000).pipe(map(() => ({ data: 'Hello world!' })));
  }

  @Sse('chat')
  chat(): Observable<{ data: string }> {
    return new Observable((observer) => {
      const text = '你好，我是 AI 助手';
      let index = 0;
      const timer = setInterval(() => {
        if(index < text.length) {
          observer.next({ data: text[index] });
          index++;
        } else {
          clearInterval(timer);
          observer.complete();
        }
      }, 200);
    });
  }
}
