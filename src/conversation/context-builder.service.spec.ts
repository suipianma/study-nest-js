import { Conversation, Message } from '@prisma/client';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { PromptGuardService } from '../security/prompt-guard.service';
import { SUMMARY_TRIGGER } from './constants';
import { ContextBuilderService } from './context-builder.service';

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;

  beforeEach(() => {
    const promptTemplateService = {
      findById: jest.fn().mockReturnValue({ id: 'tpl-1', name: '模板1' }),
      buildSystemPrompt: jest.fn().mockReturnValue('PROMPT_SYSTEM'),
      parseContextFromUserMessage: jest.fn((content: string) => content),
    } as unknown as PromptTemplateService;

    service = new ContextBuilderService(
      promptTemplateService,
      new PromptGuardService(),
    );
  });

  it('should prepend system isolation and wrap user messages', () => {
    const conversation = {
      id: 1,
      userId: 1,
      title: 'test',
      summary: null,
      summarizedMessageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      promptTemplateId: null,
    } as Conversation;

    const dbMessages = [
      {
        id: 1,
        conversationId: 1,
        role: 'user',
        content: 'hello',
        thinking: null,
        fromCache: false,
        promptTokens: null,
        completionTokens: null,
        createdAt: new Date(),
      } as Message,
    ];

    const result = service.build(conversation, dbMessages);

    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('安全规则');
    expect(result[1].role).toBe('user');
    expect(result[1].content).toContain('<<USER_INPUT>>');
    expect(result[1].content).toContain('hello');
  });

  it('should inject prompt system after isolation in long conversations', () => {
    const conversation = {
      id: 1,
      userId: 1,
      title: 'test',
      summary: 'SUMMARY_TEXT',
      summarizedMessageId: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
      promptTemplateId: null,
    } as Conversation;

    const dbMessages = Array.from({ length: SUMMARY_TRIGGER + 2 }).map(
      (_, index) =>
        ({
          id: index + 1,
          conversationId: 1,
          role: 'user',
          content: `msg-${index + 1}`,
          thinking: null,
          fromCache: false,
          promptTokens: null,
          completionTokens: null,
          createdAt: new Date(),
        }) as Message,
    );

    const result = service.build(conversation, dbMessages, {
      injectPrompt: true,
      promptId: 'tpl-1',
    });

    expect(result[0].role).toBe('system');
    expect(result[1]).toMatchObject({ role: 'system', content: 'PROMPT_SYSTEM' });
    expect(result[2].content).toContain('历史对话摘要');
  });
});
