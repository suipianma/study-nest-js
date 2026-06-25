import { Injectable, OnModuleInit } from '@nestjs/common';
import { MCP_TOOL_PREFIX } from '../agent/agent.constants';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { McpClientService } from './mcp-client.service';

@Injectable()
export class McpToolBridgeService implements OnModuleInit {
  constructor(
    private readonly mcpClient: McpClientService,
    private readonly registry: ToolRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    void this.registerToolsWhenReady();
  }

  private async registerToolsWhenReady(): Promise<void> {
    const ready = await this.mcpClient.waitUntilReady();
    if (!ready) return;

    for (const tool of this.mcpClient.listToolDefinitions()) {
      this.registry.register({
        ...tool,
        name: `${MCP_TOOL_PREFIX}${tool.name}`,
        description: `[MCP 文件系统] ${tool.description}`,
      });
    }
  }
}
