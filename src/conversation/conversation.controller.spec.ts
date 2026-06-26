import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Conversation, Message } from '@prisma/client';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { ToolOrchestratorService } from '../ai/tools/tool-orchestrator.service';
import { ToolRegistryService } from '../ai/tools/tool-registry.service';
import { ChatMessage } from '../ai/types/chat-message.type';
import { ContextComposerService } from '../context-engine/context-composer.service';
import { ContextEngineService } from '../context-engine/context-engine.service';
import { ContextPlan } from '../context-engine/types/context-plan.type';
import { ContentModerationService } from '../security/content-moderation.service';
import { PromptGuardService } from '../security/prompt-guard.service';
import { ContextBuilderService } from './context-builder.service';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { SummaryService } from './summary.service';
import { TitleService } from './title.service';

describe('ConversationController prepareStream context integration', () => {
  let moduleRef: TestingModule;
  let controller: ConversationController;

  const conversation = {
    id: 1,
    userId: 100,
    title: 'test',
    summary: 'summary text',
    summarizedMessageId: null,
    promptTemplateId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Conversation;

  const messagesBefore = [
    {
      id: 1,
      conversationId: 1,
      role: 'user',
      content: 'old question',
      thinking: null,
      fromCache: false,
      promptTokens: null,
      completionTokens: null,
      createdAt: new Date(),
    },
    {
      id: 2,
      conversationId: 1,
      role: 'assistant',
      content: 'old answer',
      thinking: null,
      fromCache: false,
      promptTokens: null,
      completionTokens: null,
      createdAt: new Date(),
    },
  ] as Message[];

  const messagesAfter = [
    ...messagesBefore,
    {
      id: 3,
      conversationId: 1,
      role: 'user',
      content: 'new question',
      thinking: null,
      fromCache: false,
      promptTokens: null,
      completionTokens: null,
      createdAt: new Date(),
    } as Message,
  ];

  const contextPlan = {
    requestId: 'req-1',
    traceId: 'trace-1',
    conversationId: 1,
    userId: 100,
    model: 'qwen3:8b',
    budget: {
      maxTokens: 4096,
      reservedForResponse: 1024,
      availableForContext: 3072,
      usedTokens: 30,
      categoryTokenUsage: {
        summary: 0,
        message: 30,
        rag: 0,
        tool: 0,
        memory: 0,
      },
    },
    selectedBlocks: [],
    droppedBlocks: [],
    trace: [],
  } as ContextPlan;

  const composedMessages: ChatMessage[] = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'new question' },
  ];

  const conversationService = {
    findOneOrFail: jest.fn().mockResolvedValue(conversation),
    assertMessageLimit: jest.fn().mockResolvedValue(undefined),
    getMessages: jest
      .fn()
      .mockResolvedValueOnce(messagesBefore)
      .mockResolvedValueOnce(messagesAfter),
    createUserMessage: jest.fn().mockResolvedValue(undefined),
    updateTitleDirect: jest.fn().mockResolvedValue(undefined),
    createAssistantMessage: jest.fn().mockResolvedValue(undefined),
    touchUpdatedAt: jest.fn().mockResolvedValue(undefined),
    bindPromptTemplate: jest.fn().mockResolvedValue(undefined),
  };
  const contextBuilder = {
    build: jest.fn(() => {
      throw new Error('legacy ContextBuilderService should not be used');
    }),
  };
  const contextEngine = {
    buildPlan: jest.fn().mockResolvedValue(contextPlan),
  };
  const contextComposer = {
    compose: jest.fn().mockReturnValue(composedMessages),
  };
  const summaryService = {
    needsSummary: jest.fn().mockReturnValue(false),
    generateInitialSummary: jest.fn().mockResolvedValue(undefined),
    scheduleSummaryUpdate: jest.fn(),
  };
  const titleService = {
    truncateTitle: jest.fn().mockReturnValue('title'),
    refineTitle: jest.fn().mockResolvedValue(undefined),
  };
  const promptTemplateService = {
    findById: jest.fn().mockReturnValue({ id: 'tpl-1' }),
    formatUserMessage: jest.fn().mockImplementation((_tpl, value) => value),
  };
  const toolOrchestrator = {
    streamWithTools: jest
      .fn()
      .mockReturnValue(of({ data: { response: 'ok', done: true } })),
  };
  const promptGuard = {
    validateUserInput: jest.fn((value: string) => ({ ok: true, sanitized: value })),
  };
  const contentModeration = {
    moderate: jest.fn((text: string) => ({ text })),
  };
  const toolRegistry = {
    getKnownToolNames: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [
        { provide: ConversationService, useValue: conversationService },
        { provide: ContextEngineService, useValue: contextEngine },
        { provide: ContextComposerService, useValue: contextComposer },
        { provide: SummaryService, useValue: summaryService },
        { provide: TitleService, useValue: titleService },
        { provide: PromptTemplateService, useValue: promptTemplateService },
        { provide: ToolOrchestratorService, useValue: toolOrchestrator },
        { provide: PromptGuardService, useValue: promptGuard },
        { provide: ContentModerationService, useValue: contentModeration },
        { provide: ToolRegistryService, useValue: toolRegistry },
        { provide: ContextBuilderService, useValue: contextBuilder },
      ],
    }).compile();

    controller = moduleRef.get(ConversationController);
  });

  afterEach(async () => {
    await moduleRef.close();
    jest.clearAllMocks();
    conversationService.getMessages
      .mockResolvedValueOnce(messagesBefore)
      .mockResolvedValueOnce(messagesAfter);
  });

  it('should build plan with context engine and compose messages before tool stream', async () => {
    const stream$ = await (
      controller as unknown as {
        prepareStream: (
          conversationId: number,
          userId: number,
          content: string,
          promptId?: string,
        ) => Promise<Observable<MessageEvent>>;
      }
    ).prepareStream(1, 100, 'new question', 'tpl-1');
    await lastValueFrom(stream$);

    expect(contextEngine.buildPlan).toHaveBeenCalledWith(
      conversation,
      messagesAfter,
      expect.objectContaining({
        injectPrompt: true,
        promptId: 'tpl-1',
      }),
    );
    const buildPlanOptions = (contextEngine.buildPlan as jest.Mock).mock.calls[0][2] as {
      currentUserMessage?: string;
    };
    expect(buildPlanOptions.currentUserMessage).toBeUndefined();
    expect(contextComposer.compose).toHaveBeenCalledWith(contextPlan);
    expect(contextBuilder.build).not.toHaveBeenCalled();
    expect(toolOrchestrator.streamWithTools).toHaveBeenCalledWith(
      composedMessages,
      conversation.summary,
      contextPlan,
    );
  });

  it('should emit error event and skip assistant persistence when stream errors without model output', async () => {
    toolOrchestrator.streamWithTools.mockReturnValueOnce(
      throwError(() => new Error('stream failed')),
    );

    const stream$ = await (
      controller as unknown as {
        prepareStream: (
          conversationId: number,
          userId: number,
          content: string,
          promptId?: string,
        ) => Promise<Observable<MessageEvent>>;
      }
    ).prepareStream(1, 100, 'new question', 'tpl-1');

    const event = await lastValueFrom(stream$);
    expect(event.data).toEqual({
      error: 'stream failed',
      done: true,
    });

    expect(conversationService.createAssistantMessage).not.toHaveBeenCalled();
    expect(conversationService.touchUpdatedAt).not.toHaveBeenCalled();
  });

  it('should pass parsed knowledgeBaseIds into context planning on stream path', async () => {
    const stream$ = await (
      controller as unknown as {
        prepareStream: (
          conversationId: number,
          userId: number,
          content: string,
          promptId?: string,
          knowledgeBaseIds?: number[],
        ) => Promise<Observable<MessageEvent>>;
      }
    ).prepareStream(1, 100, 'new question', 'tpl-1', [21, 22]);
    await lastValueFrom(stream$);

    expect(contextEngine.buildPlan).toHaveBeenCalledWith(
      conversation,
      messagesAfter,
      expect.objectContaining({
        knowledgeBaseIds: [21, 22],
      }),
    );
  });

  describe('parseKnowledgeBaseIds', () => {
    const parseKnowledgeBaseIds = (
      raw: string | string[] | undefined,
    ): number[] | undefined =>
      (
        controller as unknown as {
          parseKnowledgeBaseIds: (
            input: string | string[] | undefined,
          ) => number[] | undefined;
        }
      ).parseKnowledgeBaseIds(raw);

    it('parses comma-separated values like "1,2"', () => {
      expect(parseKnowledgeBaseIds('1,2')).toEqual([1, 2]);
    });

    it('parses repeated query array values like ["1","2"]', () => {
      expect(parseKnowledgeBaseIds(['1', '2'])).toEqual([1, 2]);
    });

    it('parses JSON array string like "[1,2]"', () => {
      expect(parseKnowledgeBaseIds('[1,2]')).toEqual([1, 2]);
    });

    it('throws 400 on invalid values', () => {
      expect(() => parseKnowledgeBaseIds('0')).toThrow(BadRequestException);
      expect(() => parseKnowledgeBaseIds('-1')).toThrow(BadRequestException);
      expect(() => parseKnowledgeBaseIds('1.5')).toThrow(BadRequestException);
      expect(() => parseKnowledgeBaseIds('abc')).toThrow(BadRequestException);
      expect(() => parseKnowledgeBaseIds('[1,')).toThrow(BadRequestException);
    });
  });
});
