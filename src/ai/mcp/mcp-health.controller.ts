import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { McpClientService } from './mcp/mcp-client.service';

@ApiTags('MCP')
@Controller('ai/mcp')
export class McpHealthController {
  constructor(private readonly mcpClient: McpClientService) {}

  @Get('health')
  @ApiOperation({ summary: 'MCP 连接健康检查' })
  async health() {
    const enabled = this.mcpClient.isEnabled();
    if (!enabled) {
      return {
        enabled: false,
        ready: false,
        status: 'disabled' as const,
        toolCount: 0,
      };
    }

    const ready = await this.mcpClient.waitUntilReady();
    return {
      enabled: true,
      ready,
      status: ready ? ('ok' as const) : ('degraded' as const),
      toolCount: ready ? this.mcpClient.listToolDefinitions().length : 0,
    };
  }
}
