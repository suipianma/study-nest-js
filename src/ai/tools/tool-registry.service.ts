import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentContext } from '../agent/agent-context.type';
import { createWeatherTool } from './implementations/weather.tool';
import { ToolDefinition } from './types/tool.type';

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private readonly tools = new Map<string, ToolDefinition>();
  private agentContext: AgentContext | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.register(createWeatherTool(this.config));
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
    return tool.execute(args);
  }
}
