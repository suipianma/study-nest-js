import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AiOrchestratorService } from '../src/ai/orchestrator/ai-orchestrator.service';
import { ConversationService } from '../src/conversation/conversation.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptors';
import { PipelineInput } from '../src/ai/orchestrator/types/pipeline-input.type';
import { of } from 'rxjs';

/** E2E 用环境变量（ConfigModule 不读 .env 文件） */
export function applyE2eEnv(): void {
  process.env.DATABASE_URL ??=
    'mysql://root:qwer1234@127.0.0.1:3306/ai_admin';
  process.env.REDIS_HOST ??= '127.0.0.1';
  process.env.REDIS_PORT ??= '6379';
  process.env.JWT_ACCESS_SECRET ??= 'e2e_access_secret';
  process.env.JWT_REFRESH_SECRET ??= 'e2e_refresh_secret';
  process.env.JWT_ACCESS_EXPIRES_IN ??= '30m';
  process.env.JWT_REFRESH_EXPIRES_IN ??= '7d';
  process.env.APP_URL ??= 'http://localhost:3000';
  process.env.CORS_ORIGIN ??= 'http://localhost:3001';
  process.env.QDRANT_URL ??= 'http://127.0.0.1:6333';
  process.env.EMBED_VECTOR_SIZE ??= '768';
  process.env.OLLAMA_URL ??= 'http://127.0.0.1:11434';
  process.env.OLLAMA_MODEL ??= 'deepseek-r1:1.5b';
}

export interface CreateE2eAppOptions {
  /** 是否 mock AI 编排（避免 E2E 依赖 Ollama） */
  mockOrchestrator?: boolean;
}

export async function createE2eApp(
  options: CreateE2eAppOptions = {},
): Promise<INestApplication<App>> {
  applyE2eEnv();

  let builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.mockOrchestrator) {
    builder = builder.overrideProvider(AiOrchestratorService).useFactory({
      inject: [ConversationService],
      factory: (conversationService: ConversationService) => ({
        run: async (input: PipelineInput) => {
          await conversationService.createUserMessage(
            input.conversationId,
            input.content.trim(),
          );
          return of({
            data: JSON.stringify({
              response: 'E2E 测试回复',
              done: true,
              streamId: 'e2e-mock-stream',
            }),
          } as MessageEvent);
        },
        resume: () =>
          of({
            data: JSON.stringify({ response: '', done: true }),
          } as MessageEvent),
      }),
    });
  }

  const moduleFixture: TestingModule = await builder.compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();
  return app;
}
