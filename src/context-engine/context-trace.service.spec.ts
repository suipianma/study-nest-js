import { ContextTraceService } from './context-trace.service';
import { TokenBudgetPlanResult } from './token-budget.manager';
import { ContextBlock } from './types/context-block.type';

const createBlock = (
  id: string,
  type: ContextBlock['type'],
  estimatedTokens: number,
): ContextBlock => ({
  id,
  type,
  role: 'system',
  content: `${id}-content`,
  priority: 100,
  estimatedTokens,
  source: 'spec',
});

describe('ContextTraceService', () => {
  it('builds trace snapshot contract fields', () => {
    const service = new ContextTraceService();
    const selectedBlocks = [createBlock('selected-1', 'summary', 20)];
    const droppedBlocks = [createBlock('dropped-1', 'rag', 10)];
    const budgetResult: TokenBudgetPlanResult = {
      selectedBlocks,
      droppedBlocks,
      categoryTokenUsage: {
        summary: 20,
        message: 0,
        rag: 0,
        tool: 0,
        memory: 0,
      },
      droppedCategories: ['rag'],
      budget: {
        maxTokens: 100,
        reservedForResponse: 40,
        availableForContext: 60,
        usedTokens: 20,
        categoryTokenUsage: {
          summary: 20,
          message: 0,
          rag: 0,
          tool: 0,
          memory: 0,
        },
      },
    };

    const snapshot = service.buildSnapshot('trace-123', budgetResult);

    expect(snapshot).toEqual(
      expect.objectContaining({
        traceId: 'trace-123',
        selectedBlocks,
        droppedBlocks,
        budget: budgetResult.budget,
        categoryTokenUsage: budgetResult.categoryTokenUsage,
        droppedCategories: ['rag'],
      }),
    );
  });
});
