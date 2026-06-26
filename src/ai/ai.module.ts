import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiCacheService } from './ai-cache.service';
import { OllamaProvider } from './providers/ollama.provider';
import { PromptTemplateService } from './prompt-template.service';
import { ToolCallParserService } from './tools/tool-call-parser.service';
import { ToolOrchestratorService } from './tools/tool-orchestrator.service';
import { ToolPromptService } from './tools/tool-prompt.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { AgentRouterService } from './agent/agent-router.service';
import { AgentOrchestratorService } from './agent/agent-orchestrator.service';
import { McpClientService } from './mcp/mcp-client.service';
import { McpToolBridgeService } from './mcp/mcp-tool-bridge.service';
import { ContextEngineModule } from '../context-engine/context-engine.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    RedisModule,
    KnowledgeBaseModule,
    forwardRef(() => ContextEngineModule),
  ],
  providers: [
    AiService,
    AiCacheService,
    OllamaProvider,
    PromptTemplateService,
    ToolCallParserService,
    ToolRegistryService,
    ToolPromptService,
    ToolOrchestratorService,
    AgentRouterService,
    AgentOrchestratorService,
    McpClientService,
    McpToolBridgeService,
  ],
  controllers: [AiController],
  exports: [
    AiService,
    PromptTemplateService,
    ToolOrchestratorService,
    ToolRegistryService,
    ToolPromptService,
    AgentRouterService,
    AgentOrchestratorService,
  ],
})
export class AiModule {}
