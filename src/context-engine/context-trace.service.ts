import { Injectable } from '@nestjs/common';
import { TokenBudgetPlanResult } from './token-budget.manager';
import { ContextTraceSnapshot } from './types/context-plan.type';

@Injectable()
export class ContextTraceService {
  buildSnapshot(
    traceId: string,
    budgetResult: TokenBudgetPlanResult,
  ): ContextTraceSnapshot {
    return {
      traceId,
      selectedBlocks: budgetResult.selectedBlocks,
      droppedBlocks: budgetResult.droppedBlocks,
      budget: budgetResult.budget,
      categoryTokenUsage: budgetResult.categoryTokenUsage,
      droppedCategories: budgetResult.droppedCategories,
    };
  }
}
