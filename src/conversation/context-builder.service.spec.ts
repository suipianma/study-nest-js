import { Conversation, Message } from '@prisma/client';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { RagChunk } from '../knowledge-base/types/rag.type';
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

    service = new ContextBuilderService(promptTemplateService);
  });

  it('should inject prompt -> rag -> summary in order', () => {
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

    const ragChunks: RagChunk[] = [
      {
        chunkId: 11,
        documentId: 22,
        documentName: '员工手册.pdf',
        knowledgeBaseId: 33,
        page: 3,
        content: 'RAG_CONTENT',
        score: 0.9,
      },
    ];

    const result = service.build(conversation, dbMessages, {
      injectPrompt: true,
      promptId: 'tpl-1',
      ragChunks,
      ragEnabled: true,
    });

    expect(result[0]).toMatchObject({ role: 'system', content: 'PROMPT_SYSTEM' });
    expect(result[1]).toMatchObject({ role: 'system' });
    expect(result[1].content).toContain('RAG_CONTENT');
    expect(result[2]).toMatchObject({
      role: 'system',
      content: '历史对话摘要：\nSUMMARY_TEXT',
    });
  });

  it('should inject rag system in short conversation path', () => {
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

    const result = service.build(conversation, dbMessages, {
      ragChunks: [],
      ragEnabled: true,
    });

    expect(result[0]).toMatchObject({ role: 'system' });
    expect(result[0].content).toContain('知识库中未找到相关信息');
    expect(result[1]).toMatchObject({ role: 'user', content: 'hello' });
  });
});
