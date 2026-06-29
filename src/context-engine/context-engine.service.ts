import { Injectable } from '@nestjs/common';
import { Conversation, Message } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PromptTemplateService } from '../ai/prompt-template.service';
import { RetrievalService } from '../knowledge-base/retrieval.service';
import { JwtUser } from '../knowledge-base/knowledge-base.service';
import { PromptGuardService } from '../security/prompt-guard.service';
import {
  TokenBudgetManager,
  TokenBudgetPlanInput,
} from './token-budget.manager';
import { estimateTokens } from './context-token.util';
import { ContextTraceService } from './context-trace.service';
import { ContextMemoryService } from './context-memory.service';
import { ContextPruningService } from './context-pruning.service';
import { RagChunk } from '../knowledge-base/types/rag.type';
import { ContextPlan } from './types/context-plan.type';
import { createToolContextBlock } from './tool-context.util';

export interface BuildContextPlanOptions extends TokenBudgetPlanInput {
  promptId?: string;
  injectPrompt?: boolean;
  /** 为 true 时由 Prompt Stage 单独注入 */
  skipPrompt?: boolean;
  /** 为 true 时由 RAG Stage 单独注入 */
  skipRag?: boolean;
  model?: string;
  requestId?: string;
  currentUserMessage?: string;
  knowledgeBaseIds?: number[];
  currentUser?: JwtUser;
}

@Injectable()
export class ContextEngineService {
  private readonly defaultModel = 'qwen3:8b';

  constructor(
    private readonly promptTemplateService: PromptTemplateService,
    private readonly promptGuard: PromptGuardService,
    private readonly retrievalService: RetrievalService,
    private readonly contextMemoryService: ContextMemoryService,
    private readonly contextPruningService: ContextPruningService,
    private readonly tokenBudgetManager: TokenBudgetManager,
    private readonly contextTraceService: ContextTraceService,
  ) {}

  async buildPlan(
    conversation: Conversation,
    dbMessages: Message[],
    options: BuildContextPlanOptions = {},
  ): Promise<ContextPlan> {
    const requestId = options.requestId?.trim() || randomUUID();
    const traceId = `trace-${requestId}`;
    const allBlocks = await this.buildBlocks(conversation, dbMessages, options);
    const pruningResult = this.contextPruningService.pruneForBudget({
      blocks: allBlocks,
      summarizedMessageId: conversation.summarizedMessageId,
    });
    const budgetResult = this.tokenBudgetManager.plan(
      pruningResult.selectedBlocks,
      options,
    );
    const mergedBudgetResult = {
      ...budgetResult,
      droppedBlocks: [...pruningResult.preDroppedBlocks, ...budgetResult.droppedBlocks],
    };
    const traceSnapshot = this.contextTraceService.buildSnapshot(
      traceId,
      mergedBudgetResult,
    );

    return {
      requestId,
      traceId,
      conversationId: conversation.id,
      userId: conversation.userId,
      model: options.model?.trim() || this.defaultModel,
      budget: mergedBudgetResult.budget,
      selectedBlocks: mergedBudgetResult.selectedBlocks,
      droppedBlocks: mergedBudgetResult.droppedBlocks,
      trace: [traceSnapshot],
    };
  }

  /** 工具执行后将结果纳入预算规划，供第二轮回答使用。 */
  extendPlanWithToolResult(
    plan: ContextPlan,
    toolName: string,
    toolResult: string,
  ): ContextPlan {
    const toolBlock = createToolContextBlock(toolName, toolResult, {
      compress: true,
      conversationId: Number(plan.conversationId),
    });
    const budgetResult = this.tokenBudgetManager.plan(
      [...plan.selectedBlocks, toolBlock],
      {
        maxTokens: plan.budget.maxTokens,
        reservedForResponse: plan.budget.reservedForResponse,
      },
    );
    const traceSnapshot = this.contextTraceService.buildSnapshot(
      plan.traceId,
      budgetResult,
    );

    return {
      ...plan,
      budget: budgetResult.budget,
      selectedBlocks: budgetResult.selectedBlocks,
      droppedBlocks: [...plan.droppedBlocks, ...budgetResult.droppedBlocks],
      trace: [...plan.trace, traceSnapshot],
    };
  }

  /** 将 Prompt / RAG 等额外块合并进规划并重新做预算裁剪 */
  enrichPlan(
    conversation: Conversation,
    plan: ContextPlan,
    extraBlocks: ContextBlock[],
    options: TokenBudgetPlanInput = {},
  ): ContextPlan {
    if (extraBlocks.length === 0) {
      return plan;
    }

    const merged = [...plan.selectedBlocks, ...extraBlocks];
    const pruningResult = this.contextPruningService.pruneForBudget({
      blocks: merged,
      summarizedMessageId: conversation.summarizedMessageId,
    });
    const budgetResult = this.tokenBudgetManager.plan(
      pruningResult.selectedBlocks,
      {
        maxTokens: options.maxTokens ?? plan.budget.maxTokens,
        reservedForResponse:
          options.reservedForResponse ?? plan.budget.reservedForResponse,
      },
    );
    const mergedBudgetResult = {
      ...budgetResult,
      droppedBlocks: [
        ...plan.droppedBlocks,
        ...pruningResult.preDroppedBlocks,
        ...budgetResult.droppedBlocks,
      ],
    };
    const traceSnapshot = this.contextTraceService.buildSnapshot(
      plan.traceId,
      mergedBudgetResult,
    );

    return {
      ...plan,
      budget: mergedBudgetResult.budget,
      selectedBlocks: mergedBudgetResult.selectedBlocks,
      droppedBlocks: mergedBudgetResult.droppedBlocks,
      trace: [...plan.trace, traceSnapshot],
    };
  }

  /** 供 Prompt Stage 构建 system prompt 块 */
  buildPromptBlock(
    conversation: Conversation,
    dbMessages: Message[],
    promptId: string,
  ): ContextBlock | null {
    return this.createPromptBlock(
      dbMessages,
      { injectPrompt: true, promptId },
      conversation,
    );
  }

  /** 供 RAG Stage 构建检索块（单次检索，避免重复 search） */
  async buildRagWithChunks(
    conversation: Conversation,
    dbMessages: Message[],
    options: {
      knowledgeBaseIds?: number[];
      currentUser?: JwtUser;
      currentUserMessage?: string;
    },
  ): Promise<{ blocks: ContextBlock[]; chunks: RagChunk[] }> {
    const currentUser = options.currentUser;
    if (!currentUser) {
      return { blocks: [], chunks: [] };
    }

    const query = this.resolveLatestUserQuery(
      dbMessages,
      options.currentUserMessage,
    );
    if (!query) {
      return { blocks: [], chunks: [] };
    }

    const chunks = await this.retrievalService.search(
      query,
      options.knowledgeBaseIds,
      currentUser,
    );

    const blocks = chunks.map((chunk, index) => {
      const content = this.buildRagBlockContent(
        chunk.documentName,
        chunk.page,
        chunk.content,
      );
      return {
        id: `rag-${chunk.chunkId}-${index}`,
        type: 'rag' as const,
        role: 'user' as const,
        content,
        priority: 700,
        estimatedTokens: estimateTokens(content),
        source: 'knowledge-base.retrieval',
        metadata: {
          conversationId: conversation.id,
          knowledgeBaseId: chunk.knowledgeBaseId,
          documentName: chunk.documentName,
        },
      };
    });

    return { blocks, chunks };
  }

  /** 供 RAG Stage 构建检索块 */
  async buildRagBlocks(
    conversation: Conversation,
    dbMessages: Message[],
    options: {
      knowledgeBaseIds?: number[];
      currentUser?: JwtUser;
      currentUserMessage?: string;
    },
  ): Promise<ContextBlock[]> {
    return this.createRagBlocks(conversation, dbMessages, {
      knowledgeBaseIds: options.knowledgeBaseIds,
      currentUser: options.currentUser,
      currentUserMessage: options.currentUserMessage,
    });
  }

  private async buildBlocks(
    conversation: Conversation,
    dbMessages: Message[],
    options: BuildContextPlanOptions,
  ): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [this.createIsolationPolicyBlock(conversation)];

    const promptBlock = options.skipPrompt
      ? null
      : this.createPromptBlock(dbMessages, options, conversation);
    if (promptBlock) {
      blocks.push(promptBlock);
    }

    const summaryBlock = this.createSummaryBlock(conversation);
    if (summaryBlock) {
      blocks.push(summaryBlock);
    }

    const memoryBlocks = await this.createMemoryBlocks(dbMessages, options);
    if (memoryBlocks.length > 0) {
      blocks.push(...memoryBlocks);
    }

    const ragBlocks = options.skipRag
      ? []
      : await this.createRagBlocks(conversation, dbMessages, options);
    if (ragBlocks.length > 0) {
      blocks.push(...ragBlocks);
    }

    const messageBlocks = this.createMessageBlocks(conversation, dbMessages);
    blocks.push(...messageBlocks);

    const currentUserBlock = this.createCurrentUserBlock(conversation, options);
    if (currentUserBlock) {
      const duplicatedUserBlock = this.findDuplicatedLatestUserBlock(
        messageBlocks,
        currentUserBlock.content,
      );
      if (duplicatedUserBlock) {
        duplicatedUserBlock.metadata = {
          ...(duplicatedUserBlock.metadata || {}),
          mustKeep: true,
        };
      } else {
        blocks.push(currentUserBlock);
      }
    }

    return blocks;
  }

  private async createRagBlocks(
    conversation: Conversation,
    dbMessages: Message[],
    options: BuildContextPlanOptions,
  ): Promise<ContextBlock[]> {
    const currentUser = options.currentUser;
    if (!currentUser) {
      return [];
    }

    const query = this.resolveLatestUserQuery(dbMessages, options.currentUserMessage);
    if (!query) {
      return [];
    }

    const chunks = await this.retrievalService.search(
      query,
      options.knowledgeBaseIds,
      currentUser,
    );

    return chunks.map((chunk, index) => {
      const content = this.buildRagBlockContent(chunk.documentName, chunk.page, chunk.content);
      return {
        id: `rag-${chunk.chunkId}-${index}`,
        type: 'rag',
        role: 'user',
        content,
        priority: 700,
        estimatedTokens: estimateTokens(content),
        source: 'knowledge-base.retrieval',
        metadata: {
          conversationId: conversation.id,
          knowledgeBaseId: chunk.knowledgeBaseId,
          documentName: chunk.documentName,
        },
      };
    });
  }

  private async createMemoryBlocks(
    dbMessages: Message[],
    options: BuildContextPlanOptions,
  ): Promise<ContextBlock[]> {
    const currentUser = options.currentUser;
    if (!currentUser) {
      return [];
    }

    const query = this.resolveLatestUserQuery(dbMessages, options.currentUserMessage);
    if (!query) {
      return [];
    }

    try {
      const memories = await this.contextMemoryService.searchMemories(
        { query },
        currentUser,
      );
      return this.contextMemoryService.toContextBlocks(memories);
    } catch {
      // 记忆检索异常时降级为空记忆，不中断上下文规划主流程。
      return [];
    }
  }

  private buildRagBlockContent(
    documentName: string,
    page: number | null | undefined,
    content: string,
  ): string {
    const pageLabel = page == null ? '' : `（第${page}页）`;
    return `来源：${documentName}${pageLabel}\n${content}`;
  }

  private createIsolationPolicyBlock(conversation: Conversation): ContextBlock {
    const content = this.promptGuard.getSystemIsolationPrompt();
    return {
      id: `policy-isolation-${conversation.id}`,
      type: 'policy',
      role: 'system',
      content,
      priority: 1000,
      estimatedTokens: estimateTokens(content),
      source: 'prompt-guard',
      metadata: {
        conversationId: conversation.id,
        category: 'system-isolation',
        mustKeep: true,
      },
    };
  }

  private createPromptBlock(
    dbMessages: Message[],
    options: BuildContextPlanOptions,
    conversation: Conversation,
  ): ContextBlock | null {
    if (!options.injectPrompt || !options.promptId) {
      return null;
    }

    const template = this.promptTemplateService.findById(options.promptId);
    if (!template) {
      return null;
    }

    const context = this.resolvePromptContext(dbMessages);
    const safeContext = this.promptGuard.wrapForModel(context);
    const content = this.promptTemplateService.buildSystemPrompt(
      template,
      safeContext,
    );

    return {
      id: `prompt-template-${template.id}`,
      type: 'prompt',
      role: 'system',
      content,
      priority: 900,
      estimatedTokens: estimateTokens(content),
      source: 'prompt-template',
      metadata: { conversationId: conversation.id, category: template.id },
    };
  }

  private resolvePromptContext(dbMessages: Message[]): string {
    const tagged = dbMessages.find(
      (message) => message.role === 'user' && /^【[^】]+】/.test(message.content),
    );
    if (tagged) {
      return this.promptTemplateService.parseContextFromUserMessage(tagged.content);
    }

    const lastUser = [...dbMessages].reverse().find((item) => item.role === 'user');
    return lastUser?.content.trim() ?? '';
  }

  private resolveLatestUserQuery(
    dbMessages: Message[],
    currentUserMessage?: string,
  ): string {
    const current = currentUserMessage?.trim();
    if (current) {
      return current;
    }

    const lastUser = [...dbMessages].reverse().find((item) => item.role === 'user');
    return lastUser?.content.trim() ?? '';
  }

  private createSummaryBlock(conversation: Conversation): ContextBlock | null {
    const summary = conversation.summary?.trim();
    if (!summary) {
      return null;
    }

    const content = `历史对话摘要：\n${summary}`;

    return {
      id: `summary-${conversation.id}`,
      type: 'summary',
      role: 'system',
      content,
      priority: 800,
      estimatedTokens: estimateTokens(content),
      source: 'conversation.summary',
      metadata: { conversationId: conversation.id },
    };
  }

  private createMessageBlocks(
    conversation: Conversation,
    dbMessages: Message[],
  ): ContextBlock[] {
    const latestUserMessageId = this.resolveLatestUserMessageId(dbMessages);
    return dbMessages.map((message) => {
      const content =
        message.role === 'assistant' && message.thinking
          ? `${message.thinking}\n${message.content}`
          : message.content;
      const isLatestUserMessage = message.id === latestUserMessageId;
      return {
        id: `message-${message.id}`,
        type: 'message',
        role: this.resolveRole(message.role),
        content,
        // 统一优先级，交给 TokenBudgetManager 在同优先级下保持原顺序。
        priority: 100,
        estimatedTokens: estimateTokens(content),
        source: 'conversation.message',
        metadata: {
          conversationId: conversation.id,
          messageId: message.id,
          ...(isLatestUserMessage ? { mustKeep: true } : {}),
          ...(message.role === 'assistant' && message.thinking
            ? { hasAssistantThinking: true }
            : {}),
        },
      };
    });
  }

  private resolveLatestUserMessageId(dbMessages: Message[]): number | null {
    for (let i = dbMessages.length - 1; i >= 0; i -= 1) {
      if (dbMessages[i].role === 'user') {
        return dbMessages[i].id;
      }
    }
    return null;
  }

  private findDuplicatedLatestUserBlock(
    messageBlocks: ContextBlock[],
    currentUserContent: string,
  ): ContextBlock | null {
    const latestUserBlock = this.findLatestUserMessageBlock(messageBlocks);
    if (!latestUserBlock) {
      return null;
    }

    return latestUserBlock.content === currentUserContent ? latestUserBlock : null;
  }

  private findLatestUserMessageBlock(messageBlocks: ContextBlock[]): ContextBlock | null {
    for (let i = messageBlocks.length - 1; i >= 0; i -= 1) {
      const block = messageBlocks[i];
      if (block.role === 'user' && block.type === 'message') {
        return block;
      }
    }
    return null;
  }

  private createCurrentUserBlock(
    conversation: Conversation,
    options: BuildContextPlanOptions,
  ): ContextBlock | null {
    const raw = options.currentUserMessage?.trim();
    if (!raw) {
      return null;
    }

    const content = this.promptGuard.sanitizeStoredContent(raw);
    if (!content) {
      return null;
    }

    return {
      id: `current-user-${conversation.id}`,
      type: 'message',
      role: 'user',
      content,
      priority: 950,
      estimatedTokens: estimateTokens(content),
      source: 'request.current-user-message',
      metadata: {
        conversationId: conversation.id,
        mustKeep: true,
      },
    };
  }

  private resolveRole(role: string): ContextRole {
    if (role === 'user' || role === 'assistant' || role === 'system') {
      return role;
    }
    return 'assistant';
  }
}
