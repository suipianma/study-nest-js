import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiCacheService } from './ai-cache.service';
import { OllamaProvider } from './providers/ollama.provider';
import { PromptTemplateService } from './prompt-template.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [AiService, AiCacheService, OllamaProvider, PromptTemplateService],
  controllers: [AiController],
  exports: [AiService, PromptTemplateService],
})
export class AiModule {}
