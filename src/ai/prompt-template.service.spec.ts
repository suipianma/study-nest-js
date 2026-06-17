import { PromptTemplateService } from './prompt-template.service';
import { PromptTemplate } from './types/prompt-template.type';

describe('PromptTemplateService', () => {
  let service: PromptTemplateService;

  beforeEach(() => {
    service = new PromptTemplateService();
  });

  it('buildSystemPrompt 应组装 Role/Task/Context/Constraint/Output', () => {
    const template: PromptTemplate = {
      id: 'frontend-interviewer',
      name: '前端面试官',
      description: 'test',
      role: '你是一名资深前端面试官',
      task: '请根据用户技术栈生成面试题',
      contextLabel: '用户技术栈',
      constraints: ['难度中级', '不要给答案'],
      outputFormat: 'Markdown格式',
    };

    const result = service.buildSystemPrompt(
      template,
      'React、Vue、TypeScript',
    );

    expect(result).toContain('你是一名资深前端面试官');
    expect(result).toContain('请根据用户技术栈生成面试题');
    expect(result).toContain('React、Vue、TypeScript');
    expect(result).toContain('- 难度中级');
    expect(result).toContain('Markdown格式');
  });

  it('parseContextFromUserMessage 应从【名称】后解析 context', () => {
    expect(
      service.parseContextFromUserMessage('【前端面试官】React, Vue'),
    ).toBe('React, Vue');
    expect(service.parseContextFromUserMessage('普通消息')).toBe('');
  });

  it('formatUserMessage 应加模板前缀', () => {
    expect(
      service.formatUserMessage(
        { name: '前端面试官' } as PromptTemplate,
        'React',
      ),
    ).toBe('【前端面试官】React');
  });
});
