import { of } from 'rxjs';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { PipelineInput } from './types/pipeline-input.type';
import { PipelineStage } from './types/pipeline-stage.type';

function createStage(name: string, order: string[]): PipelineStage {
  return {
    name,
    execute: jest.fn(async () => {
      order.push(name);
    }),
  };
}

describe('AiOrchestratorService', () => {
  const order: string[] = [];
  const inputStage = createStage('input', order);
  const contextStage = createStage('context', order);
  const promptStage = createStage('prompt', order);
  const ragStage = createStage('rag', order);
  const toolStage = createStage('tool', order);
  const streamStage = {
    ...createStage('stream', order),
    observe: jest.fn(() => of({ data: { done: true } } as MessageEvent)),
  };
  const conversationStreamService = {
    observeSession: jest.fn(() => of({ data: { done: true } } as MessageEvent)),
  };

  let service: AiOrchestratorService;

  const pipelineInput: PipelineInput = {
    conversationId: 1,
    userId: 10,
    role: 'user',
    content: '你好',
  };

  beforeEach(() => {
    order.length = 0;
    jest.clearAllMocks();
    service = new AiOrchestratorService(
      inputStage as any,
      contextStage as any,
      promptStage as any,
      ragStage as any,
      toolStage as any,
      streamStage as any,
      conversationStreamService as any,
    );
  });

  it('run 应按固定顺序执行全部 Stage 并返回 SSE', async () => {
    const obs = await service.run(pipelineInput);

    expect(order).toEqual([
      'input',
      'context',
      'prompt',
      'rag',
      'tool',
      'stream',
    ]);
    expect(streamStage.observe).toHaveBeenCalledTimes(1);

    const events: MessageEvent[] = [];
    await new Promise<void>((resolve) => {
      obs.subscribe({
        next: (event) => events.push(event),
        complete: () => resolve(),
      });
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it('resume 应委托 ConversationStreamService.observeSession', () => {
    const obs = service.resume(1, 10, 'stream-abc');
    expect(conversationStreamService.observeSession).toHaveBeenCalledWith(
      'stream-abc',
      1,
      10,
    );
    expect(obs).toBeDefined();
  });
});
