import { ContextPruningService } from './context-pruning.service';
import { ContextBlock, ContextRole, ContextBlockType } from './types/context-block.type';

const createBlock = (
  id: string,
  messageId: number,
  role: ContextRole,
  content: string,
  overrides: Partial<ContextBlock> = {},
): ContextBlock => ({
  id,
  type: 'message' as ContextBlockType,
  role,
  content,
  priority: 100,
  estimatedTokens: Math.ceil(content.length / 4),
  source: 'conversation.message',
  metadata: {
    conversationId: 1,
    messageId,
    ...(overrides.metadata || {}),
  },
  ...overrides,
});

describe('ContextPruningService.pruneForBudget', () => {
  let service: ContextPruningService;

  beforeEach(() => {
    service = new ContextPruningService();
  });

  it('keeps current user block with mustKeep metadata', () => {
    const mustKeepUser = createBlock(
      'current-user',
      999,
      'user',
      '当前问题',
      { metadata: { mustKeep: true } },
    );
    const result = service.pruneForBudget({
      blocks: [createBlock('old-1', 1, 'assistant', '旧消息'), mustKeepUser],
      summarizedMessageId: 10,
    });

    expect(result.selectedBlocks.find((block) => block.id === 'current-user')).toBeDefined();
    expect(result.preDroppedBlocks.find((block) => block.id === 'current-user')).toBeUndefined();
  });

  it('drops messages already covered by summary first', () => {
    const result = service.pruneForBudget({
      blocks: [
        createBlock('msg-1', 1, 'user', 'old-1'),
        createBlock('msg-2', 2, 'assistant', 'old-2'),
        createBlock('msg-4', 4, 'user', 'new-4'),
      ],
      summarizedMessageId: 2,
    });

    expect(result.preDroppedBlocks.map((block) => block.id)).toEqual(['msg-1', 'msg-2']);
    expect(result.selectedBlocks.map((block) => block.id)).toEqual(['msg-4']);
  });

  it('lowers priority for older messages', () => {
    const result = service.pruneForBudget({
      blocks: [
        createBlock('msg-1', 1, 'user', 'oldest'),
        createBlock('msg-2', 2, 'assistant', 'middle'),
        createBlock('msg-3', 3, 'user', 'newest'),
      ],
    });

    const msg1 = result.selectedBlocks.find((block) => block.id === 'msg-1');
    const msg2 = result.selectedBlocks.find((block) => block.id === 'msg-2');
    const msg3 = result.selectedBlocks.find((block) => block.id === 'msg-3');
    expect(msg1 && msg2 && msg3).toBeTruthy();
    expect((msg1 as ContextBlock).priority).toBeLessThan((msg2 as ContextBlock).priority);
    expect((msg2 as ContextBlock).priority).toBeLessThan((msg3 as ContextBlock).priority);
  });

  it('strips thinking-heavy assistant content before budget planning', () => {
    const thinkingHeavy = `${'analysis '.repeat(80)}\n最终回答`;
    const result = service.pruneForBudget({
      blocks: [
        createBlock('assistant-1', 10, 'assistant', thinkingHeavy, {
          metadata: { hasAssistantThinking: true },
        }),
      ],
    });
    const assistant = result.selectedBlocks[0];

    expect(assistant.content).toBe('最终回答');
    expect(assistant.content).not.toContain('analysis');
    expect(assistant.estimatedTokens).toBeLessThan(Math.ceil(thinkingHeavy.length / 4));
  });

  it('does not compress normal multiline assistant content without thinking metadata', () => {
    const normalMultiline = `${'这里是正常多行回复，'.repeat(20)}\n结论：仍需保留完整上下文`;
    const result = service.pruneForBudget({
      blocks: [createBlock('assistant-normal', 11, 'assistant', normalMultiline)],
    });
    const assistant = result.selectedBlocks[0];

    expect(assistant.content).toBe(normalMultiline);
    expect(assistant.estimatedTokens).toBe(Math.ceil(normalMultiline.length / 4));
  });
});
