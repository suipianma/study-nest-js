import { ChatMessage } from '../ai/types/chat-message.type';
import { PromptGuardService } from '../security/prompt-guard.service';
import { ContextComposerService } from './context-composer.service';
import { ContextBlock, ContextBlockType, ContextRole } from './types/context-block.type';
import { ContextPlan } from './types/context-plan.type';

const createBlock = (
  id: string,
  type: ContextBlockType,
  role: ContextRole,
  content: string,
): ContextBlock => ({
  id,
  type,
  role,
  content,
  priority: 1,
  estimatedTokens: 1,
  source: 'spec',
});

describe('ContextComposerService.compose', () => {
  let service: ContextComposerService;
  let promptGuard: Pick<PromptGuardService, 'wrapForModel'>;

  beforeEach(() => {
    promptGuard = {
      wrapForModel: jest.fn((content: string) => `wrapped(${content})`),
    };

    service = new ContextComposerService(promptGuard as PromptGuardService);
  });

  it('returns empty ChatMessage[] for empty input', () => {
    const emptyBlocksResult = service.compose([]);
    const emptyPlanResult = service.compose({ selectedBlocks: [] });

    expect(emptyBlocksResult).toEqual<ChatMessage[]>([]);
    expect(emptyPlanResult).toEqual<ChatMessage[]>([]);
    expect(promptGuard.wrapForModel).not.toHaveBeenCalled();
  });

  it('keeps selected order and composes non-risky blocks directly', () => {
    const blocks: ContextBlock[] = [
      createBlock('sys-1', 'system', 'system', 'system content'),
      createBlock('policy-1', 'policy', 'system', 'policy content'),
      createBlock('summary-1', 'summary', 'assistant', 'summary content'),
      createBlock('prompt-1', 'prompt', 'user', 'prompt as user role'),
    ];

    const result = service.compose(blocks);

    expect(result).toEqual<ChatMessage[]>([
      { role: 'system', content: 'system content' },
      { role: 'system', content: 'policy content' },
      { role: 'assistant', content: 'summary content' },
      { role: 'user', content: 'prompt as user role' },
    ]);
    expect(promptGuard.wrapForModel).not.toHaveBeenCalled();
  });

  it('composes from ContextPlan.selectedBlocks and ignores dropped blocks', () => {
    const selected = createBlock('selected-1', 'message', 'assistant', 'keep me');
    const dropped = createBlock('dropped-1', 'message', 'assistant', 'drop me');

    const plan: ContextPlan = {
      requestId: 'req-1',
      traceId: 'trace-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      model: 'gpt-test',
      budget: {
        maxTokens: 1000,
        reservedForResponse: 200,
        availableForContext: 800,
        usedTokens: 10,
        categoryTokenUsage: {
          summary: 0,
          message: 10,
          rag: 0,
          tool: 0,
          memory: 0,
        },
      },
      selectedBlocks: [selected],
      droppedBlocks: [dropped],
      trace: [],
    };

    const result = service.compose(plan);

    expect(result).toEqual<ChatMessage[]>([
      { role: 'assistant', content: 'keep me' },
    ]);
  });

  it('wraps risky user payload block types with PromptGuard', () => {
    const blocks: ContextBlock[] = [
      createBlock('message-1', 'message', 'user', 'message content'),
      createBlock('rag-1', 'rag', 'user', 'rag content'),
      createBlock('tool-1', 'tool', 'user', 'tool content'),
      createBlock('memory-1', 'memory', 'user', 'memory content'),
      createBlock('message-2', 'message', 'assistant', 'assistant content'),
    ];

    const result = service.compose(blocks);

    expect(promptGuard.wrapForModel).toHaveBeenCalledTimes(4);
    expect(promptGuard.wrapForModel).toHaveBeenNthCalledWith(1, 'message content');
    expect(promptGuard.wrapForModel).toHaveBeenNthCalledWith(2, 'rag content');
    expect(promptGuard.wrapForModel).toHaveBeenNthCalledWith(3, 'tool content');
    expect(promptGuard.wrapForModel).toHaveBeenNthCalledWith(4, 'memory content');

    expect(result).toEqual<ChatMessage[]>([
      { role: 'user', content: 'wrapped(message content)' },
      { role: 'user', content: 'wrapped(rag content)' },
      { role: 'user', content: 'wrapped(tool content)' },
      { role: 'user', content: 'wrapped(memory content)' },
      { role: 'assistant', content: 'assistant content' },
    ]);
  });

  it('wraps only risky payload blocks with user role in mixed role/type cases', () => {
    const blocks: ContextBlock[] = [
      createBlock('message-user-1', 'message', 'user', 'user message content'),
      createBlock('message-assistant-1', 'message', 'assistant', 'assistant message content'),
      createBlock('rag-system-1', 'rag', 'system', 'system rag content'),
      createBlock('prompt-user-1', 'prompt', 'user', 'user prompt content'),
      createBlock('memory-user-1', 'memory', 'user', 'user memory content'),
    ];

    const result = service.compose(blocks);

    expect(promptGuard.wrapForModel).toHaveBeenCalledTimes(2);
    expect(promptGuard.wrapForModel).toHaveBeenNthCalledWith(1, 'user message content');
    expect(promptGuard.wrapForModel).toHaveBeenNthCalledWith(2, 'user memory content');
    expect(result).toEqual<ChatMessage[]>([
      { role: 'user', content: 'wrapped(user message content)' },
      { role: 'assistant', content: 'assistant message content' },
      { role: 'system', content: 'system rag content' },
      { role: 'user', content: 'user prompt content' },
      { role: 'user', content: 'wrapped(user memory content)' },
    ]);
  });
});
