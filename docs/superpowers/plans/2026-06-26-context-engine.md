# Context Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Context Engine with token budget control, layered summary compression, long conversation pruning, context trace, and short-term/long-term memory.

**Architecture:** Add a focused `context-engine` backend module that converts existing conversation, summary, RAG, tool, and memory inputs into `ContextBlock[]`, plans them with `TokenBudgetManager`, and composes final `ChatMessage[]`. Keep existing `ConversationController`, `SummaryService`, `RetrievalService`, and tool orchestration compatible while moving context decisions behind `ContextEngineService`.

**Tech Stack:** NestJS, Prisma, Jest, RxJS, MySQL, existing `AiService`, existing `RetrievalService`, existing security services.

---

## File Structure

Create:

- `study-nest-js/src/context-engine/context-engine.module.ts`  
  Nest module exporting `ContextEngineService`, `ContextComposer`, `TokenBudgetManager`, `ContextPruningService`, `ContextTraceService`, `ContextMemoryService`.

- `study-nest-js/src/context-engine/types/context-block.type.ts`  
  Defines `ContextBlock`, `ContextBlockType`, `ContextRole`, `ContextBlockMetadata`.

- `study-nest-js/src/context-engine/types/context-plan.type.ts`  
  Defines `ContextPlan`, `ContextBudget`, `ContextTraceSnapshot`.

- `study-nest-js/src/context-engine/context-token.util.ts`  
  Conservative token estimator used before adding model-specific tokenizers.

- `study-nest-js/src/context-engine/token-budget.manager.ts`  
  Selects and drops blocks according to budget, priority, and must-keep rules.

- `study-nest-js/src/context-engine/context-composer.service.ts`  
  Converts selected blocks into `ChatMessage[]` with security boundaries.

- `study-nest-js/src/context-engine/context-pruning.service.ts`  
  Applies long-conversation pruning and thinking/tool compression rules.

- `study-nest-js/src/context-engine/context-trace.service.ts`  
  Builds trace snapshots for selected/dropped blocks and budget usage.

- `study-nest-js/src/context-engine/context-engine.service.ts`  
  Main facade used by `ConversationController`.

- `study-nest-js/src/context-engine/context-memory.service.ts`  
  Short-term/long-term memory read/write/search/forget service.

- `study-nest-js/src/context-engine/dto/create-memory.dto.ts`  
  Explicit memory creation DTO.

- `study-nest-js/src/context-engine/dto/search-memory.dto.ts`  
  Memory search DTO.

- `study-nest-js/src/context-engine/token-budget.manager.spec.ts`
- `study-nest-js/src/context-engine/context-composer.service.spec.ts`
- `study-nest-js/src/context-engine/context-pruning.service.spec.ts`
- `study-nest-js/src/context-engine/context-engine.service.spec.ts`
- `study-nest-js/src/context-engine/context-memory.service.spec.ts`

Modify:

- `study-nest-js/prisma/schema.prisma`  
  Add `Memory` model.

- `study-nest-js/src/app.module.ts`  
  Import `ContextEngineModule`.

- `study-nest-js/src/conversation/conversation.module.ts`  
  Import `ContextEngineModule`.

- `study-nest-js/src/conversation/conversation.controller.ts`  
  Replace direct `ContextBuilderService.build()` call with `ContextEngineService.buildPlan()` + `ContextComposer.compose()`.

- `study-nest-js/src/conversation/summary.service.ts`  
  Update summary prompt to layered summary format.

- `study-nest-js/src/ai/agent/agent-orchestrator.service.ts`  
  Route tool final-answer context through composer-compatible blocks in a later task.

Do not create a git commit unless the user explicitly asks.

---

## Task 1: P0 Types and Token Estimation

**Files:**
- Create: `study-nest-js/src/context-engine/types/context-block.type.ts`
- Create: `study-nest-js/src/context-engine/types/context-plan.type.ts`
- Create: `study-nest-js/src/context-engine/context-token.util.ts`
- Create: `study-nest-js/src/context-engine/token-budget.manager.spec.ts`

- [ ] **Step 1: Write failing token utility test**

Add to `token-budget.manager.spec.ts`:

```ts
import { estimateTokens } from './context-token.util';

describe('estimateTokens', () => {
  it('uses conservative character based estimation', () => {
    expect(estimateTokens('abcdef')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
cd study-nest-js
npm test -- --testPathPatterns=context-engine/token-budget.manager.spec.ts
```

Expected: FAIL because `context-token.util` does not exist.

- [ ] **Step 3: Implement types and estimator**

Create `context-block.type.ts` with block types:

```ts
export type ContextBlockType =
  | 'system'
  | 'policy'
  | 'prompt'
  | 'summary'
  | 'message'
  | 'rag'
  | 'tool'
  | 'memory';

export type ContextRole = 'system' | 'user' | 'assistant';

export interface ContextBlockMetadata {
  conversationId?: number;
  messageId?: number;
  memoryId?: number;
  knowledgeBaseId?: number;
  documentName?: string;
  toolName?: string;
  mustKeep?: boolean;
  category?: string;
  [key: string]: unknown;
}

export interface ContextBlock {
  id: string;
  type: ContextBlockType;
  role: ContextRole;
  content: string;
  priority: number;
  estimatedTokens: number;
  source: string;
  metadata?: ContextBlockMetadata;
}
```

Create `context-plan.type.ts`:

```ts
import { ContextBlock } from './context-block.type';

export interface ContextBudget {
  maxTokens: number;
  reservedForResponse: number;
  availableForContext: number;
  usedTokens: number;
}

export interface ContextTraceSnapshot {
  traceId: string;
  selectedBlocks: Array<Pick<ContextBlock, 'id' | 'type' | 'source' | 'estimatedTokens'>>;
  droppedBlocks: Array<Pick<ContextBlock, 'id' | 'type' | 'source' | 'estimatedTokens'>>;
  budget: ContextBudget;
}

export interface ContextPlan {
  requestId: string;
  traceId: string;
  conversationId: number;
  userId: number;
  model: string;
  budget: ContextBudget;
  selectedBlocks: ContextBlock[];
  droppedBlocks: ContextBlock[];
  trace: ContextTraceSnapshot;
}
```

Create `context-token.util.ts`:

```ts
export function estimateTokens(content: string): number {
  const normalized = content.trim();
  if (!normalized) return 0;
  return Math.ceil(normalized.length / 3);
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns=context-engine/token-budget.manager.spec.ts
```

Expected: PASS.

---

## Task 2: P0 TokenBudgetManager

**Files:**
- Modify: `study-nest-js/src/context-engine/token-budget.manager.spec.ts`
- Create: `study-nest-js/src/context-engine/token-budget.manager.ts`

- [ ] **Step 1: Write failing selection tests**

Add tests:

```ts
import { TokenBudgetManager } from './token-budget.manager';
import { ContextBlock } from './types/context-block.type';

function block(id: string, priority: number, tokens: number, mustKeep = false): ContextBlock {
  return {
    id,
    type: 'message',
    role: 'user',
    content: id,
    priority,
    estimatedTokens: tokens,
    source: 'test',
    metadata: { mustKeep },
  };
}

describe('TokenBudgetManager', () => {
  it('keeps must-keep blocks even when they exceed soft budget', () => {
    const manager = new TokenBudgetManager();
    const result = manager.plan([block('current-user', 95, 9000, true)], {
      maxTokens: 8192,
      reservedForResponse: 2048,
    });

    expect(result.selectedBlocks.map((item) => item.id)).toEqual(['current-user']);
    expect(result.droppedBlocks).toEqual([]);
  });

  it('drops lower priority blocks when budget is full', () => {
    const manager = new TokenBudgetManager();
    const result = manager.plan(
      [block('low', 10, 3000), block('high', 90, 3000), block('mid', 50, 3000)],
      { maxTokens: 8192, reservedForResponse: 2048 },
    );

    expect(result.selectedBlocks.map((item) => item.id)).toEqual(['high', 'mid']);
    expect(result.droppedBlocks.map((item) => item.id)).toEqual(['low']);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- --testPathPatterns=context-engine/token-budget.manager.spec.ts
```

Expected: FAIL because `TokenBudgetManager` is missing.

- [ ] **Step 3: Implement TokenBudgetManager**

Create `token-budget.manager.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ContextBlock } from './types/context-block.type';

interface BudgetInput {
  maxTokens?: number;
  reservedForResponse?: number;
}

export interface BudgetPlanResult {
  selectedBlocks: ContextBlock[];
  droppedBlocks: ContextBlock[];
  budget: {
    maxTokens: number;
    reservedForResponse: number;
    availableForContext: number;
    usedTokens: number;
  };
}

@Injectable()
export class TokenBudgetManager {
  plan(blocks: ContextBlock[], input: BudgetInput = {}): BudgetPlanResult {
    const maxTokens = input.maxTokens ?? 8192;
    const reservedForResponse = input.reservedForResponse ?? 2048;
    const availableForContext = Math.max(0, maxTokens - reservedForResponse);

    const ordered = [...blocks].sort((a, b) => {
      const priority = b.priority - a.priority;
      if (priority !== 0) return priority;
      return blocks.indexOf(a) - blocks.indexOf(b);
    });

    const selectedBlocks: ContextBlock[] = [];
    const droppedBlocks: ContextBlock[] = [];
    let usedTokens = 0;

    for (const item of ordered) {
      const mustKeep = item.metadata?.mustKeep === true;
      if (mustKeep || usedTokens + item.estimatedTokens <= availableForContext) {
        selectedBlocks.push(item);
        usedTokens += item.estimatedTokens;
      } else {
        droppedBlocks.push(item);
      }
    }

    return {
      selectedBlocks,
      droppedBlocks,
      budget: {
        maxTokens,
        reservedForResponse,
        availableForContext,
        usedTokens,
      },
    };
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns=context-engine/token-budget.manager.spec.ts
```

Expected: PASS.

---

## Task 3: P0 ContextComposer

**Files:**
- Create: `study-nest-js/src/context-engine/context-composer.service.ts`
- Create: `study-nest-js/src/context-engine/context-composer.service.spec.ts`

- [ ] **Step 1: Write failing composer test**

Test behavior:

- selected blocks become `ChatMessage[]`
- user/rag/tool/memory content is boundary-wrapped
- dropped blocks are not composed

Run:

```bash
npm test -- --testPathPatterns=context-engine/context-composer.service.spec.ts
```

Expected: FAIL because service is missing.

- [ ] **Step 2: Implement ContextComposer**

Implementation rules:

- keep block order from `selectedBlocks`
- call `PromptGuardService.wrapForModel()` for block types `message`, `rag`, `tool`, `memory` when role is `user`
- return objects matching existing `ChatMessage`

- [ ] **Step 3: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns=context-engine/context-composer.service.spec.ts
```

Expected: PASS.

---

## Task 4: P0 ContextEngineService and Module

**Files:**
- Create: `study-nest-js/src/context-engine/context-trace.service.ts`
- Create: `study-nest-js/src/context-engine/context-engine.service.ts`
- Create: `study-nest-js/src/context-engine/context-engine.module.ts`
- Create: `study-nest-js/src/context-engine/context-engine.service.spec.ts`
- Modify: `study-nest-js/src/app.module.ts`
- Modify: `study-nest-js/src/conversation/conversation.module.ts`

- [ ] **Step 1: Write failing engine test**

Test behavior:

- system policy block is always present
- conversation summary becomes summary block
- recent messages become message blocks
- current user message is `mustKeep`
- returned plan contains selected/dropped/trace

Run:

```bash
npm test -- --testPathPatterns=context-engine/context-engine.service.spec.ts
```

Expected: FAIL because service is missing.

- [ ] **Step 2: Implement ContextTraceService**

Create trace snapshots from budget result:

- `traceId`
- selected block id/type/source/tokens
- dropped block id/type/source/tokens
- budget

- [ ] **Step 3: Implement ContextEngineService**

Use existing dependencies:

- `PromptTemplateService`
- `PromptGuardService`
- `TokenBudgetManager`
- `ContextTraceService`

Build blocks:

- system policy
- prompt template when `promptId` exists
- summary when `conversation.summary` exists
- recent messages

P0 does not fetch RAG or memory yet; it accepts optional pre-collected blocks for P1/P2.

- [ ] **Step 4: Register module**

`ContextEngineModule` imports existing modules only when required and exports:

- `ContextEngineService`
- `ContextComposer`
- `TokenBudgetManager`

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns=context-engine/context-engine.service.spec.ts
```

Expected: PASS.

---

## Task 5: P0 Conversation Flow Integration

**Files:**
- Modify: `study-nest-js/src/conversation/conversation.controller.ts`
- Modify: `study-nest-js/src/conversation/conversation.module.ts`
- Modify: `study-nest-js/src/conversation/context-builder.service.spec.ts`
- Create or Modify: `study-nest-js/src/context-engine/context-engine.service.spec.ts`

- [ ] **Step 1: Write failing integration-style unit test**

Test that `prepareStream` path uses `ContextEngineService.buildPlan()` and `ContextComposer.compose()` instead of direct `ContextBuilderService.build()`.

If private method testing is too brittle, write a controller provider test that spies on dependencies and calls `stream()`.

Expected RED: test fails because controller still calls `ContextBuilderService`.

- [ ] **Step 2: Integrate ContextEngineService**

Change controller flow:

```text
messages + conversation + promptId
  → contextEngine.buildPlan()
  → contextComposer.compose()
  → toolOrchestrator.streamWithTools()
```

Keep `ContextBuilderService` provider during migration to avoid breaking existing tests.

- [ ] **Step 3: Verify existing context tests**

Run:

```bash
npm test -- --testPathPatterns="context-engine|context-builder|conversation"
```

Expected: PASS for relevant unit tests. Existing unrelated repository test failures should be recorded separately and not hidden.

---

## Task 6: P1 ContextPruningService and Layered Summary

**Files:**
- Create: `study-nest-js/src/context-engine/context-pruning.service.ts`
- Create: `study-nest-js/src/context-engine/context-pruning.service.spec.ts`
- Modify: `study-nest-js/src/conversation/summary.service.ts`

- [ ] **Step 1: Write failing pruning tests**

Test behavior:

- current user message is retained
- recent user/assistant messages outrank older messages
- assistant thinking-heavy content can be compressed
- old messages covered by summary are dropped first

Run:

```bash
npm test -- --testPathPatterns=context-engine/context-pruning.service.spec.ts
```

Expected: FAIL because service is missing.

- [ ] **Step 2: Implement ContextPruningService**

Rules:

- mark current user block as `mustKeep`
- reduce priority of older messages
- strip or compress assistant thinking before budget planning
- keep recent 2-4 rounds before older messages

- [ ] **Step 3: Update SummaryService prompt**

Change summary prompt output format to:

```text
【滚动摘要】
用户核心诉求、已回答内容、当前对话背景

【主题摘要】
按主题归纳的关键事实、涉及的知识库、重要引用

【决策与待办】
用户已确认的结论、约束条件、未完成任务、后续需要保持的偏好
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns="context-engine/context-pruning|conversation/summary"
```

Expected: PASS.

---

## Task 7: P1 RAG / Tool / Message Budget Allocation and Trace

**Files:**
- Modify: `study-nest-js/src/context-engine/context-engine.service.ts`
- Modify: `study-nest-js/src/context-engine/token-budget.manager.ts`
- Modify: `study-nest-js/src/context-engine/context-trace.service.ts`
- Modify: `study-nest-js/src/conversation/conversation.controller.ts`

- [ ] **Step 1: Write failing budget allocation test**

Test that a plan containing message, summary, rag, tool, and memory blocks:

- always keeps system and current user
- selects blocks by priority inside available budget
- records dropped rag/tool/message blocks in trace

Expected RED: current manager has no category-aware trace assertions.

- [ ] **Step 2: Add category budget metadata**

Budget manager should annotate the trace with:

- summary token estimate
- message token estimate
- rag token estimate
- tool token estimate
- memory token estimate

- [ ] **Step 3: Thread `knowledgeBaseIds` into context planning**

Existing frontend already has `knowledgeBaseIds` in request type. Backend conversation stream should accept it and pass it into context engine. If SSE query format is used, parse comma-separated IDs.

- [ ] **Step 4: Convert RAG chunks to `ContextBlock(type=rag)`**

Use `RetrievalService.search()` with current user identity and selected IDs.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns="context-engine|knowledge-base/retrieval"
```

Expected: PASS.

---

## Task 8: P2 Prisma Memory Model

**Files:**
- Modify: `study-nest-js/prisma/schema.prisma`

- [ ] **Step 1: Add Memory model**

Add model:

```prisma
model Memory {
  id                   Int       @id @default(autoincrement())
  ownerUserId           Int
  scope                 String    @db.VarChar(20)
  type                  String    @db.VarChar(20)
  category              String    @db.VarChar(40)
  content               String    @db.Text
  sourceConversationId  Int?
  sourceMessageId       Int?
  importance            Int       @default(50)
  expiresAt             DateTime?
  deletedAt             DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([ownerUserId, type, updatedAt])
  @@index([scope, category, updatedAt])
  @@index([expiresAt])
  @@index([deletedAt])
}
```

- [ ] **Step 2: Generate Prisma client**

Run:

```bash
cd study-nest-js
npm run prisma:generate
```

Expected: Prisma client generation succeeds.

- [ ] **Step 3: Create migration**

Run only when local DB is available:

```bash
npm run prisma:migrate:dev -- --name add_context_memory
```

Expected: migration file created and DB updated. If DB is unavailable, stop and report that migration could not be applied locally.

---

## Task 9: P2 ContextMemoryService

**Files:**
- Create: `study-nest-js/src/context-engine/context-memory.service.ts`
- Create: `study-nest-js/src/context-engine/context-memory.service.spec.ts`
- Create: `study-nest-js/src/context-engine/dto/create-memory.dto.ts`
- Create: `study-nest-js/src/context-engine/dto/search-memory.dto.ts`

- [ ] **Step 1: Write failing permission tests**

Test behavior:

- private memory readable only by owner
- team memory readable by same role
- org memory readable by authenticated users
- deleted and expired memory are excluded

Expected RED: service is missing.

- [ ] **Step 2: Implement DTOs**

DTO fields:

- `scope`
- `type`
- `category`
- `content`
- `importance`
- `expiresAt`
- `sourceConversationId`
- `sourceMessageId`

- [ ] **Step 3: Implement ContextMemoryService**

Methods:

- `createMemory(dto, currentUser)`
- `searchMemories(query, currentUser)`
- `forgetMemory(id, currentUser)`
- `toContextBlocks(memories)`

Permission rules:

- user can create private memory for self
- admin can create team/org memory
- user can forget own private memory
- admin can forget any memory

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns=context-engine/context-memory.service.spec.ts
```

Expected: PASS.

---

## Task 10: P2 Memory Integration into ContextPlan

**Files:**
- Modify: `study-nest-js/src/context-engine/context-engine.service.ts`
- Modify: `study-nest-js/src/context-engine/context-engine.service.spec.ts`
- Modify: `study-nest-js/src/context-engine/context-engine.module.ts`

- [ ] **Step 1: Write failing memory integration test**

Test that long-term memory returned from `ContextMemoryService.searchMemories()` becomes `ContextBlock(type=memory)` and enters selected blocks when budget allows.

Expected RED: memory not yet integrated.

- [ ] **Step 2: Inject ContextMemoryService**

Use current user and latest user query to search memories during plan building.

- [ ] **Step 3: Convert memories to blocks**

Memory block rules:

- type: `memory`
- role: `user`
- priority: `60 + importance / 10`
- source: `memory:${id}`
- metadata includes `scope`, `category`, `memoryId`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- --testPathPatterns=context-engine
```

Expected: PASS.

---

## Task 11: Full Verification

**Files:**
- No new files unless failures reveal missing tests.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd study-nest-js
npm test -- --testPathPatterns="context-engine|conversation|knowledge-base|ai/agent"
```

Expected: context-engine tests pass. Any pre-existing unrelated failures must be listed separately.

- [ ] **Step 2: Run type check/build**

Run:

```bash
npm run build
```

Expected: build succeeds. If existing unrelated TypeScript errors appear, record exact files and errors.

- [ ] **Step 3: Manual regression checklist**

Verify:

- normal chat still streams
- long conversation triggers summary and still answers
- selected knowledge bases influence context
- tool call still works
- stopped stream still persists interrupted reply
- memory permission tests pass
- deleted/expired memories do not enter context

---

## Self-Review Notes

Spec coverage:

- P0 `ContextPlan`, `ContextBlock`, `ContextComposer`, `TokenBudgetManager`, `ConversationSummary` are covered by Tasks 1-5.
- P1 layered summary, pruning, RAG/Tool/Message budget and trace are covered by Tasks 6-7.
- P2 short-term/long-term memory, permissions, retrieval and forgetting are covered by Tasks 8-10.

No implementation commits are included because commits require explicit user instruction.
