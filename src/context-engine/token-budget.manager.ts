import { Injectable } from '@nestjs/common';
import { ContextBlock, ContextBlockType } from './types/context-block.type';
import {
  ContextBudget,
  TRACE_TOKEN_CATEGORIES,
  TraceTokenCategory,
} from './types/context-plan.type';

export interface TokenBudgetPlanInput {
  maxTokens?: number;
  reservedForResponse?: number;
}

export interface TokenBudgetPlanResult {
  selectedBlocks: ContextBlock[];
  droppedBlocks: ContextBlock[];
  budget: ContextBudget;
  categoryTokenUsage: Record<TraceTokenCategory, number>;
  droppedCategories: TraceTokenCategory[];
}

const FIXED_BLOCK_TYPES = new Set<ContextBlockType>(['system', 'policy', 'prompt']);

const CATEGORY_RATIOS: Record<TraceTokenCategory, number> = {
  summary: 0.2,
  message: 0.35,
  rag: 0.25,
  tool: 0.1,
  memory: 0.1,
};

const RELEASE_TARGET_CATEGORIES: TraceTokenCategory[] = ['message', 'rag'];

@Injectable()
export class TokenBudgetManager {
  plan(
    blocks: ContextBlock[],
    input: TokenBudgetPlanInput = {},
  ): TokenBudgetPlanResult {
    const maxTokens = input.maxTokens ?? 8192;
    const reservedForResponse = input.reservedForResponse ?? 2048;
    const availableForContext = Math.max(0, maxTokens - reservedForResponse);

    const indexedBlocks = blocks.map((block, index) => ({ block, index }));
    const pinned = indexedBlocks.filter((item) => this.isPinnedBlock(item.block));
    const flexible = indexedBlocks.filter((item) => !this.isPinnedBlock(item.block));

    const selectedIds = new Set<string>();
    let usedTokens = 0;

    for (const item of pinned) {
      selectedIds.add(item.block.id);
      usedTokens += item.block.estimatedTokens;
    }

    const categoryCaps = this.buildCategoryCaps(availableForContext, flexible);
    const categoryUsage = this.createEmptyCategoryUsage();
    const droppedCategories = new Set<TraceTokenCategory>();

    const grouped = this.groupFlexibleByCategory(flexible);
    for (const category of TRACE_TOKEN_CATEGORIES) {
      const cap = categoryCaps[category];
      const candidates = grouped[category];
      if (candidates.length === 0) {
        continue;
      }

      const ordered = [...candidates].sort((a, b) => {
        if (a.block.priority === b.block.priority) {
          return a.index - b.index;
        }
        return b.block.priority - a.block.priority;
      });

      let categoryUsed = 0;
      let categorySelected = 0;

      for (const item of ordered) {
        const nextCategoryTotal = categoryUsed + item.block.estimatedTokens;
        const nextGlobalTotal = usedTokens + item.block.estimatedTokens;
        if (
          nextCategoryTotal <= cap &&
          nextGlobalTotal <= availableForContext
        ) {
          selectedIds.add(item.block.id);
          usedTokens = nextGlobalTotal;
          categoryUsed = nextCategoryTotal;
          categorySelected += 1;
          categoryUsage[category] += item.block.estimatedTokens;
        }
      }

      if (categorySelected < candidates.length) {
        droppedCategories.add(category);
      }
    }

    const droppedBlocks = blocks.filter((block) => !selectedIds.has(block.id));
    const selectedBlocks = blocks.filter((block) => selectedIds.has(block.id));

    return {
      selectedBlocks,
      droppedBlocks,
      categoryTokenUsage: categoryUsage,
      droppedCategories: TRACE_TOKEN_CATEGORIES.filter((category) =>
        droppedCategories.has(category),
      ),
      budget: {
        maxTokens,
        reservedForResponse,
        availableForContext,
        usedTokens,
        categoryTokenUsage: categoryUsage,
      },
    };
  }

  private isPinnedBlock(block: ContextBlock): boolean {
    return block.metadata?.mustKeep === true || FIXED_BLOCK_TYPES.has(block.type);
  }

  private buildCategoryCaps(
    availableForContext: number,
    flexible: Array<{ block: ContextBlock; index: number }>,
  ): Record<TraceTokenCategory, number> {
    const grouped = this.groupFlexibleByCategory(flexible);
    const caps = TRACE_TOKEN_CATEGORIES.reduce(
      (acc, category) => {
        acc[category] = Math.floor(availableForContext * CATEGORY_RATIOS[category]);
        return acc;
      },
      {} as Record<TraceTokenCategory, number>,
    );

    let releasable = 0;
    for (const category of TRACE_TOKEN_CATEGORIES) {
      if (grouped[category].length === 0) {
        releasable += caps[category];
        caps[category] = 0;
      }
    }

    if (releasable > 0) {
      const releaseTotal = RELEASE_TARGET_CATEGORIES.reduce(
        (sum, category) => sum + CATEGORY_RATIOS[category],
        0,
      );
      for (const category of RELEASE_TARGET_CATEGORIES) {
        const share = CATEGORY_RATIOS[category] / releaseTotal;
        caps[category] += Math.floor(releasable * share);
      }
    }

    return caps;
  }

  private groupFlexibleByCategory(
    flexible: Array<{ block: ContextBlock; index: number }>,
  ): Record<TraceTokenCategory, Array<{ block: ContextBlock; index: number }>> {
    const grouped = TRACE_TOKEN_CATEGORIES.reduce(
      (acc, category) => {
        acc[category] = [];
        return acc;
      },
      {} as Record<TraceTokenCategory, Array<{ block: ContextBlock; index: number }>>,
    );

    for (const item of flexible) {
      if (this.isTrackedCategory(item.block.type)) {
        grouped[item.block.type].push(item);
      }
    }

    return grouped;
  }

  private createEmptyCategoryUsage(): Record<TraceTokenCategory, number> {
    return TRACE_TOKEN_CATEGORIES.reduce(
      (acc, category) => {
        acc[category] = 0;
        return acc;
      },
      {} as Record<TraceTokenCategory, number>,
    );
  }

  private isTrackedCategory(type: ContextBlock['type']): type is TraceTokenCategory {
    return (TRACE_TOKEN_CATEGORIES as readonly string[]).includes(type);
  }
}
