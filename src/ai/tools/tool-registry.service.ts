import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetrievalService } from '../../knowledge-base/retrieval.service';
import { PromptGuardService } from '../../security/prompt-guard.service';
import { AgentContext } from '../agent/agent-context.type';
import { createKnowledgeBaseSearchTool } from './implementations/knowledge-base-search.tool';
import { createWeatherTool } from './implementations/weather.tool';
import { ToolDefinition } from './types/tool.type';

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private readonly tools = new Map<string, ToolDefinition>();
  private agentContext: AgentContext | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly promptGuard: PromptGuardService,
    private readonly retrievalService: RetrievalService,
  ) {}

  onModuleInit(): void {
    this.register(createWeatherTool(this.config));
    this.register(
      createKnowledgeBaseSearchTool(this.retrievalService, () => {
        if (!this.agentContext) {
          throw new Error('Agent 上下文未初始化');
        }
        return this.agentContext;
      }),
    );
  }

  setAgentContext(context: AgentContext): void {
    this.agentContext = context;
  }

  getAgentContext(): AgentContext | null {
    return this.agentContext;
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getKnownToolNames(): Set<string> {
    return new Set(this.tools.keys());
  }

  listDefinitions(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  async execute(name: string, args: Record<string, string>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`未知工具: ${name}`);
    }
    const safeArgs = this.promptGuard.sanitizeToolArgs(args);
    return tool.execute(safeArgs);
  }
}
