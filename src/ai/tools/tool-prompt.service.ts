import { Injectable } from '@nestjs/common';
import { PromptGuardService } from '../../security/prompt-guard.service';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class ToolPromptService {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly promptGuard: PromptGuardService,
  ) {}

  build(): string {
    return [this.promptGuard.getSystemIsolationPrompt(), '', this.buildToolInstructions()].join(
      '\n',
    );
  }

  /** 已有 isolation system 时仅追加工具说明 */
  buildToolInstructions(): string {
    const lines = [
      '你是一个智能助手。当用户问题需要查询实时外部信息时，你必须只输出一个 JSON 对象，不要输出任何其他文字或 Markdown。',
      '',
      '可用工具：',
    ];

    this.registry.listDefinitions().forEach((tool, index) => {
      lines.push(`${index + 1}. ${tool.name} — ${tool.description}`);
      tool.parameters.forEach((param) => {
        const required = param.required ? '，必填' : '';
        lines.push(`   参数：${param.name} (string${required}) — ${param.description}`);
      });
    });

    lines.push(
      '',
      '输出格式（仅 JSON，无代码块）：',
      '{"tool":"weather","city":"武汉"}',
      '',
      '如果不需要调用工具，直接用自然语言回答用户，不要输出 JSON。',
    );

    return lines.join('\n');
  }
}
