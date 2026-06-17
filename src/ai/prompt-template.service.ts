import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  PromptTemplate,
  PromptTemplateListItem,
} from './types/prompt-template.type';

@Injectable()
export class PromptTemplateService implements OnModuleInit {
  private readonly logger = new Logger(PromptTemplateService.name);
  private readonly templates = new Map<string, PromptTemplate>();
  private readonly promptsDir = join(__dirname, 'prompts');

  onModuleInit(): void {
    this.loadTemplates();
  }

  findAll(): PromptTemplateListItem[] {
    return [...this.templates.values()].map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      contextLabel: t.contextLabel,
      contextPlaceholder: t.contextPlaceholder,
    }));
  }

  findById(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  buildSystemPrompt(template: PromptTemplate, context: string): string {
    const lines: string[] = [template.role, '', template.task, ''];

    const trimmedContext = context.trim();
    if (trimmedContext) {
      lines.push(`${template.contextLabel}：`, trimmedContext, '');
    }

    lines.push('要求：');
    template.constraints.forEach((c) => lines.push(`- ${c}`));
    lines.push('', '输出：', template.outputFormat);

    return lines.join('\n');
  }

  formatUserMessage(template: PromptTemplate, context: string): string {
    return `【${template.name}】${context.trim()}`;
  }

  /** 从首条用户消息解析 Context（【模板名】后的内容） */
  parseContextFromUserMessage(content: string): string {
    const match = /^【[^】]+】([\s\S]*)$/.exec(content.trim());
    return match?.[1]?.trim() ?? '';
  }

  private loadTemplates(): void {
    let files: string[];
    try {
      files = readdirSync(this.promptsDir).filter((f) => f.endsWith('.json'));
    } catch (err) {
      this.logger.warn(`Prompt 目录不存在: ${this.promptsDir}`, err);
      return;
    }

    for (const file of files) {
      try {
        const raw = readFileSync(join(this.promptsDir, file), 'utf-8');
        const template = JSON.parse(raw) as PromptTemplate;
        if (!template.id) {
          this.logger.warn(`跳过无效模板 ${file}: 缺少 id`);
          continue;
        }
        this.templates.set(template.id, template);
      } catch (err) {
        this.logger.warn(`跳过无效模板 ${file}`, err);
      }
    }

    this.logger.log(`已加载 ${this.templates.size} 个 Prompt 模板`);
  }
}
