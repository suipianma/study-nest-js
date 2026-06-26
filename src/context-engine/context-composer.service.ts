import { Injectable } from '@nestjs/common';
import { ChatMessage } from '../ai/types/chat-message.type';
import { PromptGuardService } from '../security/prompt-guard.service';
import { ContextBlock, ContextBlockType } from './types/context-block.type';
import { ContextPlan } from './types/context-plan.type';

type ComposerInput = ContextBlock[] | Pick<ContextPlan, 'selectedBlocks'>;

@Injectable()
export class ContextComposerService {
  private readonly riskyUserBlockTypes: ReadonlySet<ContextBlockType> = new Set<
    ContextBlockType
  >(['message', 'rag', 'tool', 'memory']);

  constructor(private readonly promptGuard: PromptGuardService) {}

  compose(input: ComposerInput): ChatMessage[] {
    const selectedBlocks = Array.isArray(input) ? input : input.selectedBlocks;
    return selectedBlocks.map((block) => this.toChatMessage(block));
  }

  /** 第二轮：上下文 + 工具调用原文 + 工具结果块。 */
  composeRound2(
    plan: ContextPlan,
    toolCall: { tool: string; raw: string },
  ): ChatMessage[] {
    const toolBlocks = plan.selectedBlocks.filter(
      (block) => block.type === 'tool' && block.source === `tool:${toolCall.tool}`,
    );
    const contextBlocks = plan.selectedBlocks.filter(
      (block) => !toolBlocks.some((toolBlock) => toolBlock.id === block.id),
    );

    return [
      ...this.compose({ selectedBlocks: contextBlocks }),
      { role: 'assistant', content: toolCall.raw },
      ...this.compose({ selectedBlocks: toolBlocks }),
    ];
  }

  private toChatMessage(block: ContextBlock): ChatMessage {
    // 仅将用户载荷性质的风险块内容包裹后再发给模型。
    const shouldWrap =
      block.role === 'user' && this.isRiskyUserPayloadType(block.type);

    return {
      role: block.role,
      content: shouldWrap
        ? this.promptGuard.wrapForModel(block.content)
        : block.content,
    };
  }

  private isRiskyUserPayloadType(type: ContextBlockType): boolean {
    return this.riskyUserBlockTypes.has(type);
  }
}
