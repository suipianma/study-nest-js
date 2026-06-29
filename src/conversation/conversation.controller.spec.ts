import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { lastValueFrom, of } from 'rxjs';
import { AiOrchestratorService } from '../ai/orchestrator/ai-orchestrator.service';
import { ContextTraceStoreService } from '../context-engine/context-trace-store.service';
import { ConversationStreamService } from './conversation-stream.service';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { StreamSessionService } from './stream-session.service';
import { StreamTicketService } from './stream-ticket.service';

describe('ConversationController orchestrator integration', () => {
  let moduleRef: TestingModule;
  let controller: ConversationController;

  const aiOrchestrator = {
    run: jest.fn().mockResolvedValue(
      of({ data: { response: 'ok', done: true, streamId: 'stream-1' } }),
    ),
    resume: jest.fn().mockReturnValue(
      of({ data: { response: 'resumed', done: true } }),
    ),
  };

  const conversationService = {
    findOneOrFail: jest.fn().mockResolvedValue({ id: 1 }),
  };

  const streamSessionService = {
    getSession: jest.fn().mockResolvedValue({
      streamId: 'stream-1',
      conversationId: 1,
      userId: 100,
    }),
  };

  const conversationStreamService = {
    cancelGeneration: jest.fn().mockResolvedValue(undefined),
    toPublicSnapshot: jest.fn(),
  };

  const contextTraceStore = {
    get: jest.fn(),
  };

  const streamTicketService = {
    createTicket: jest.fn().mockResolvedValue({ ticket: 't-1', expiresIn: 120 }),
    resolveTicket: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [
        { provide: ConversationService, useValue: conversationService },
        { provide: AiOrchestratorService, useValue: aiOrchestrator },
        { provide: StreamSessionService, useValue: streamSessionService },
        { provide: ConversationStreamService, useValue: conversationStreamService },
        { provide: ContextTraceStoreService, useValue: contextTraceStore },
        { provide: StreamTicketService, useValue: streamTicketService },
      ],
    }).compile();

    controller = moduleRef.get(ConversationController);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('stream 新消息应委托 AiOrchestrator.run', async () => {
    const req = { user: { userId: 100, username: 'u', role: 'user' } };
    const stream$ = controller.stream(
      '1',
      '你好',
      undefined,
      undefined,
      '1,2',
      undefined,
      undefined,
      req as any,
    );

    const event = await lastValueFrom(stream$);
    expect(aiOrchestrator.run).toHaveBeenCalledWith({
      conversationId: 1,
      userId: 100,
      role: 'user',
      content: '你好',
      promptId: undefined,
      knowledgeBaseIds: [1, 2],
      isRegenerate: false,
      model: undefined,
    });
    expect(event.data).toEqual(
      expect.objectContaining({ response: 'ok', done: true }),
    );
  });

  it('stream 续传应委托 AiOrchestrator.resume', async () => {
    const req = { user: { userId: 100, username: 'u', role: 'user' } };
    const stream$ = controller.stream(
      '1',
      undefined,
      'stream-1',
      undefined,
      undefined,
      undefined,
      undefined,
      req as any,
    );

    await lastValueFrom(stream$);
    expect(aiOrchestrator.resume).toHaveBeenCalledWith(1, 100, 'stream-1');
    expect(aiOrchestrator.run).not.toHaveBeenCalled();
  });

  it('content 为空时应抛 BadRequestException', () => {
    const req = { user: { userId: 100, username: 'u', role: 'user' } };
    expect(() =>
      controller.stream('1', '', undefined, undefined, undefined, undefined, undefined, req as any),
    ).toThrow(BadRequestException);
  });
});
