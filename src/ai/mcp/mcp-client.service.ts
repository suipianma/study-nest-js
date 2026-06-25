import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { ToolDefinition } from '../tools/types/tool.type';

@Injectable()
export class McpClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpClientService.name);
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private enabled = false;
  private toolDefinitions: ToolDefinition[] = [];
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  /** 等待后台 MCP 连接完成（不阻塞应用启动） */
  async waitUntilReady(): Promise<boolean> {
    if (this.config.get<string>('MCP_FILESYSTEM_ENABLED') !== 'true') {
      return false;
    }
    if (!this.connectPromise) return false;
    await this.connectPromise;
    return this.enabled;
  }

  onModuleInit(): void {
    this.connectPromise = this.connectMcp();
  }

  private async connectMcp(): Promise<void> {
    if (this.config.get<string>('MCP_FILESYSTEM_ENABLED') !== 'true') {
      this.logger.log('MCP filesystem 已禁用');
      return;
    }

    const roots = this.resolveRoots();
    if (roots.length === 0) {
      this.logger.warn('MCP_FILESYSTEM_ROOTS 无有效路径，跳过连接');
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', ...roots],
        stderr: 'pipe',
      });
      const client = new Client({
        name: 'study-nest-js',
        version: '1.0.0',
      });

      await client.connect(transport);
      this.client = client;
      this.transport = transport;
      this.enabled = true;
      this.toolDefinitions = await this.loadToolDefinitions();
      this.logger.log(
        `MCP filesystem 已连接，注册 ${this.toolDefinitions.length} 个工具`,
      );
    } catch (error) {
      this.logger.warn(
        `MCP filesystem 连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  listToolDefinitions(): ToolDefinition[] {
    return this.toolDefinitions;
  }

  private resolveRoots(): string[] {
    const raw = this.config.get<string>('MCP_FILESYSTEM_ROOTS') ?? '';
    const cwd = process.cwd();
    const repoRoot = resolve(cwd, '..');

    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => resolve(cwd, item))
      .filter((absPath) => {
        if (!absPath.startsWith(repoRoot)) {
          this.logger.warn(`MCP 路径越界已忽略: ${absPath}`);
          return false;
        }
        if (!existsSync(absPath)) {
          this.logger.warn(`MCP 路径不存在已忽略: ${absPath}`);
          return false;
        }
        return true;
      });
  }

  private async loadToolDefinitions(): Promise<ToolDefinition[]> {
    if (!this.client) return [];

    const { tools } = await this.client.listTools();
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: this.extractParameters(tool.inputSchema),
      execute: async (args) => this.callTool(tool.name, args),
    }));
  }

  private extractParameters(
    schema: unknown,
  ): ToolDefinition['parameters'] {
    if (!schema || typeof schema !== 'object') return [];
    const record = schema as {
      properties?: Record<string, { description?: string }>;
      required?: string[];
    };
    const properties = record.properties ?? {};
    const required = new Set(record.required ?? []);

    return Object.entries(properties).map(([name, meta]) => ({
      name,
      description: meta.description ?? name,
      required: required.has(name),
    }));
  }

  private async callTool(
    name: string,
    args: Record<string, string>,
  ): Promise<string> {
    if (!this.client) {
      throw new Error('MCP 客户端未连接');
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    if (result.isError) {
      const message = this.formatToolContent(result.content);
      throw new Error(message || `MCP 工具 ${name} 执行失败`);
    }

    return this.formatToolContent(result.content) || '(空结果)';
  }

  private formatToolContent(
    content: Array<{ type: string; text?: string }> | unknown,
  ): string {
    if (!Array.isArray(content)) return '';
    return content
      .map((item) => {
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: string }).text ?? '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
}
