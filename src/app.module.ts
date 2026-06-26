import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exception.filter';
import { LoggerModule } from './common/logger/logger.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { UserContextMiddleware } from './common/middleware/user-context.middleware';
import { TimeoutMiddleware } from './common/middleware/timeout.middleware';
import { UploadModule } from './upload/upload.module';
import { ChatModule } from './chat/chat.module';
import { AiModule } from './ai/ai.module';
import { ConversationModule } from './conversation/conversation.module';
import { ContextEngineModule } from './context-engine/context-engine.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    SecurityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
    }),
    UserModule,
    PrismaModule,
    AuthModule,
    RedisModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    LoggerModule,
    UploadModule,
    ChatModule,
    AiModule,
    ContextEngineModule,
    ConversationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    LoggerMiddleware,
    UserContextMiddleware,
    TimeoutMiddleware,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(UserContextMiddleware, TimeoutMiddleware, LoggerMiddleware)
      .forRoutes('*');
  }
}
