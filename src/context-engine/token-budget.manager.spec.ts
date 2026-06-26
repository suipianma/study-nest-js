import { estimateTokens } from './context-token.util';
import { TokenBudgetManager } from './token-budget.manager';
import { ContextBlock } from './types/context-block.type';

// Task 1 intentionally focuses on early token-estimation coverage; manager behavior tests will be added in the next task.
describe('estimateTokens', () => {
  it("estimateTokens('abcdef') === 2", () => {
    expect(estimateTokens('abcdef')).toBe(2);
  });

  it("estimateTokens('') === 0", () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for whitespace-only input', () => {
    expect(estimateTokens('   \n\t  ')).toBe(0);
  });

  it('handles length boundaries 1,2,3,4', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('ab')).toBe(1);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(2);
  });

  it('keeps current heuristic for Chinese/mixed text', () => {
    expect(estimateTokens('中文ab')).toBe(2);
  });
});

const createBlock = (
  id: string,
  priority: number,
  estimatedTokens: number,
  mustKeep = false,
  type: ContextBlock['type'] = 'message',
): ContextBlock => ({
  id,
  type,
  role: 'user',
  content: id,
  priority,
  estimatedTokens,
  source: 'spec',
  metadata: mustKeep ? { mustKeep: true } : undefined,
});

describe('TokenBudgetManager.plan', () => {
  let manager: TokenBudgetManager;

  beforeEach(() => {
    manager = new TokenBudgetManager();
  });

  it('keeps mustKeep blocks even if they exceed soft budget', () => {
    const blocks: ContextBlock[] = [
      createBlock('normal-high', 100, 20),
      createBlock('must-keep', 10, 120, true),
      createBlock('normal-low', 5, 10),
    ];

    const result = manager.plan(blocks, {
      maxTokens: 100,
      reservedForResponse: 50,
    });

    expect(result.selectedBlocks.map((item) => item.id)).toEqual(['must-keep']);
    expect(result.droppedBlocks.map((item) => item.id)).toEqual([
      'normal-high',
      'normal-low',
    ]);
    expect(result.budget.availableForContext).toBe(50);
    expect(result.budget.usedTokens).toBe(120);
  });

  it('drops lower-priority blocks within the same category cap', () => {
    const blocks: ContextBlock[] = [
      createBlock('summary-high', 100, 5, false, 'summary'),
      createBlock('summary-low', 1, 10, false, 'summary'),
      createBlock('rag-high', 100, 5, false, 'rag'),
      createBlock('rag-low', 1, 10, false, 'rag'),
    ];

    const result = manager.plan(blocks, {
      maxTokens: 100,
      reservedForResponse: 50,
    });

    expect(result.selectedBlocks.map((item) => item.id)).toEqual([
      'summary-high',
      'rag-high',
      'rag-low',
    ]);
    expect(result.droppedBlocks.map((item) => item.id)).toEqual(['summary-low']);
    expect(result.budget.availableForContext).toBe(50);
    expect(result.budget.usedTokens).toBe(20);
  });

  it('releases empty category budget to message and rag', () => {
    const blocks: ContextBlock[] = [
      createBlock('message-a', 100, 10, false, 'message'),
      createBlock('message-b', 90, 10, false, 'message'),
    ];

    const result = manager.plan(blocks, {
      maxTokens: 100,
      reservedForResponse: 0,
    });

    expect(result.selectedBlocks.map((item) => item.id)).toEqual([
      'message-a',
      'message-b',
    ]);
    expect(result.categoryTokenUsage.message).toBe(20);
  });

  it('tracks selected category token usage and dropped categories', () => {
    const blocks: ContextBlock[] = [
      createBlock('summary', 100, 5, false, 'summary'),
      createBlock('message', 90, 5, false, 'message'),
      createBlock('rag', 80, 5, false, 'rag'),
      createBlock('tool', 70, 5, false, 'tool'),
      createBlock('memory', 60, 5, false, 'memory'),
      createBlock('policy', 50, 5, false, 'policy'),
    ];

    const result = manager.plan(blocks, {
      maxTokens: 100,
      reservedForResponse: 60,
    });

    expect(result.selectedBlocks.map((item) => item.id)).toEqual([
      'summary',
      'message',
      'rag',
      'policy',
    ]);
    expect(result.categoryTokenUsage).toEqual({
      summary: 5,
      message: 5,
      rag: 5,
      tool: 0,
      memory: 0,
    });
    expect(result.droppedCategories).toEqual(['tool', 'memory']);
  });

  it('keeps mustKeep policy block under tiny budget', () => {
    const blocks: ContextBlock[] = [
      createBlock('policy-block', 1000, 40, true, 'policy'),
      createBlock('message-block', 100, 10, false, 'message'),
    ];

    const result = manager.plan(blocks, {
      maxTokens: 10,
      reservedForResponse: 9,
    });

    expect(result.selectedBlocks.map((item) => item.id)).toEqual(['policy-block']);
    expect(result.droppedBlocks.map((item) => item.id)).toEqual(['message-block']);
    expect(result.budget.availableForContext).toBe(1);
    expect(result.budget.usedTokens).toBe(40);
  });
});
