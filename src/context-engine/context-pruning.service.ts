import { Injectable } from '@nestjs/common';
import { estimateTokens } from './context-token.util';
import { ContextBlock } from './types/context-block.type';

export interface ContextPruningInput {
  blocks: ContextBlock[];
  summarizedMessageId?: number | string | null;
}

export interface ContextPruningResult {
  selectedBlocks: ContextBlock[];
  preDroppedBlocks: ContextBlock[];
}

@Injectable()
export class ContextPruningService {
  pruneForBudget(input: ContextPruningInput): ContextPruningResult {
    const summarizedMessageId = this.toComparableNumber(input.summarizedMessageId);
    const preDroppedBlocks: ContextBlock[] = [];
    const selectedBlocks: ContextBlock[] = [];

    for (const rawBlock of input.blocks) {
      const block = this.compressAssistantThinkingIfNeeded(rawBlock);

      // 已被摘要覆盖的历史消息优先丢弃，避免重复占用预算。
      if (this.shouldDropAsSummarized(block, summarizedMessageId)) {
        preDroppedBlocks.push(block);
        continue;
      }

      selectedBlocks.push(block);
    }

    this.lowerOlderMessagePriority(selectedBlocks);

    return {
      selectedBlocks,
      preDroppedBlocks,
    };
  }

  private shouldDropAsSummarized(
    block: ContextBlock,
    summarizedMessageId: number | null,
  ): boolean {
    if (summarizedMessageId === null) {
      return false;
    }
    if (block.metadata?.mustKeep) {
      return false;
    }
    if (block.type !== 'message') {
      return false;
    }

    const blockMessageId = this.toComparableNumber(block.metadata?.messageId);
    if (blockMessageId === null) {
      return false;
    }

    return blockMessageId <= summarizedMessageId;
  }

  private lowerOlderMessagePriority(blocks: ContextBlock[]): void {
    const adjustable = blocks
      .filter(
        (block) =>
          block.type === 'message' &&
          !block.metadata?.mustKeep &&
          this.toComparableNumber(block.metadata?.messageId) !== null,
      )
      .sort(
        (a, b) =>
          (this.toComparableNumber(a.metadata?.messageId) as number) -
          (this.toComparableNumber(b.metadata?.messageId) as number),
      );

    const total = adjustable.length;
    adjustable.forEach((block, index) => {
      const penalty = total - index - 1;
      block.priority = Math.max(0, block.priority - penalty);
    });
  }

  private compressAssistantThinkingIfNeeded(block: ContextBlock): ContextBlock {
    if (block.type !== 'message' || block.role !== 'assistant') {
      return block;
    }
    if (block.metadata?.hasAssistantThinking !== true) {
      return block;
    }
    if (!block.content.includes('\n')) {
      return block;
    }

    const lines = block.content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 2) {
      return block;
    }

    const answer = lines[lines.length - 1];
    const thinking = lines.slice(0, -1).join('\n');
    if (thinking.length < 120) {
      return block;
    }

    return {
      ...block,
      content: answer,
      estimatedTokens: estimateTokens(answer),
    };
  }

  private toComparableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}
