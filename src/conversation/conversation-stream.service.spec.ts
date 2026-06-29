import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { of, Subject } from 'rxjs';
import { ConversationStreamService } from './conversation-stream.service';
import { MessageMetadata } from './types/message-metadata.type';

describe('ConversationStreamService', () => {
  const streamSessionService = {
    getSession: jest.fn(),
    markStatus: jest.fn(),
    updateProgress: jest.fn(),
    toSnapshot: jest.fn(),
  };
  const agentOrchestrator = { streamWithAgent: jest.fn() };
  const aiService = { streamChat: jest.fn() };
  const conversationService = {
    createAssistantMessage: jest.fn(),
    touchUpdatedAt: jest.fn(),
  };
  const summaryService = { scheduleSummaryUpdate: jest.fn() };
  const titleService = { refineTitle: jest.fn() };
  const contentModeration = { moderate: jest.fn((text: string) => ({ text })) };
  const contextTraceStore = { save: jest.fn().mockResolvedValue(undefined) };

  function createService() {
    return new ConversationStreamService(
      streamSessionService as any,
      agentOrchestrator as any,
      aiService as any,
      conversationService as any,
      summaryService as any,
      titleService as any,
      contentModeration as any,
      contextTraceStore as any,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('collectStreamArtifacts 应记录 tool 与 agent 元数据', () => {
    const service = createService();
    const metadata: MessageMetadata = { toolCalls: [], agentSteps: [] };

    (service as any).collectStreamArtifacts(metadata, {
      phase: 'agent_start',
      maxSteps: 5,
    });
    (service as any).collectStreamArtifacts(metadata, {
      phase: 'tool_call',
      tool: 'weather',
      args: { city: '北京' },
      toolCallId: 'tc-1',
    });
    (service as any).collectStreamArtifacts(metadata, {
      phase: 'tool_result',
      tool: 'weather',
      result: '晴天',
      toolCallId: 'tc-1',
    });
    (service as any).collectStreamArtifacts(metadata, {
      phase: 'agent_done',
      steps: 1,
    });

    expect(metadata.agentSteps).toHaveLength(2);
    expect(metadata.toolCalls).toHaveLength(1);
    expect(metadata.toolCalls![0].status).toBe('done');
    expect(metadata.toolCalls![0].result).toBe('晴天');
  });

  it('startDetachedGeneration 首帧应保存 Context Trace', () => {
    const service = createService();
    aiService.streamChat.mockReturnValue(of({ data: { done: true } }));

    service.startDetachedGeneration({
      streamId: 'stream-1',
      conversationId: 9,
      userId: 3,
      userMessageContent: 'hello',
      isFirstAiReply: true,
      contextPlan: {
        requestId: 'req-1',
        traceId: 'trace-req-1',
        conversationId: 9,
        userId: 3,
        model: 'qwen3:8b',
        budget: {
          maxTokens: 8000,
          reservedForResponse: 2000,
          availableForContext: 6000,
          usedTokens: 100,
          categoryTokenUsage: {
            summary: 0,
            message: 100,
            rag: 0,
            tool: 0,
            memory: 0,
          },
        },
        selectedBlocks: [],
        droppedBlocks: [],
        trace: [],
      },
      ollamaMessages: [],
      summary: null,
      executionMode: 'direct',
      agentContext: { userId: 3, conversationId: 9, role: 'user' },
    });

    expect(contextTraceStore.save).toHaveBeenCalledWith(
      3,
      9,
      expect.objectContaining({ requestId: 'req-1' }),
      { stageTimings: undefined },
    );
  });

  it('cancelGeneration 在会话不存在时应抛出 NotFoundException', async () => {
    streamSessionService.getSession.mockResolvedValue(null);
    const service = createService();

    await expect(
      service.cancelGeneration('stream-missing', 9, 3),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelGeneration 在用户无权访问时应抛出 ForbiddenException', async () => {
    streamSessionService.getSession.mockResolvedValue({
      streamId: 'stream-1',
      conversationId: 9,
      userId: 99,
      status: 'generating',
    });
    const service = createService();

    await expect(
      service.cancelGeneration('stream-1', 9, 3),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('emitLive 应向 Subject 订阅者推送 v2 信封', (done) => {
    const service = createService();
    const subject = new Subject();
    (service as any).streamSubjects.set('stream-1', subject);

    subject.subscribe({
      next: (payload) => {
        expect(payload).toMatchObject({
          v: 2,
          type: 'message_delta',
          streamId: 'stream-1',
          payload: { response: 'hi' },
        });
        done();
      },
    });

    (service as any).emitLive('stream-1', {
      streamId: 'stream-1',
      response: 'hi',
    });
  });
});
