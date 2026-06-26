# Agent 能力集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 聊天集成多步 ReAct Agent（内置工具 + 知识库检索 + MCP filesystem），支持智能路由直答/Agent，前端展示执行时间线。

**Architecture:** 新建 `AgentRouterService` + `AgentOrchestratorService` 替代单轮 `ToolOrchestrator` 主路径；`McpClientService` stdio 连接 filesystem MCP；`searchKnowledgeBase` 工具复用 `RetrievalService`；`ConversationController` 按路由走 direct 或 agent 流。

**Tech Stack:** NestJS 11, Ollama, @modelcontextprotocol/sdk, Next.js 16, Ant Design 6

**Spec:** `docs/superpowers/specs/2026-06-25-agent-integration-design.md`

---

## 文件结构预览

### 后端新建

| 文件 | 职责 |
|------|------|
| `study-nest-js/src/ai/agent/agent.constants.ts` | MAX_AGENT_STEPS 等 |
| `study-nest-js/src/ai/agent/agent-context.type.ts` | Agent 运行时上下文 |
| `study-nest-js/src/ai/agent/agent-router.service.ts` | 直答 vs Agent 路由 |
| `study-nest-js/src/ai/agent/agent-router.service.spec.ts` | 路由单测 |
| `study-nest-js/src/ai/agent/agent-orchestrator.service.ts` | ReAct 多步循环 |
| `study-nest-js/src/ai/agent/agent-orchestrator.service.spec.ts` | 编排单测 |
| `study-nest-js/src/ai/mcp/mcp-client.service.ts` | MCP stdio 客户端 |
| `study-nest-js/src/ai/mcp/mcp-tool-bridge.service.ts` | MCP → ToolRegistry |
| `study-nest-js/src/ai/tools/implementations/knowledge-base-search.tool.ts` | KB 检索工具 |

### 后端修改

| 文件 | 变更 |
|------|------|
| `study-nest-js/package.json` | 添加 `@modelcontextprotocol/sdk` |
| `study-nest-js/.env.dev` | MCP 配置 |
| `study-nest-js/SETUP.md` | MCP 启动说明 |
| `study-nest-js/src/ai/ai.module.ts` | 注册 Agent/MCP providers，import KnowledgeBaseModule |
| `study-nest-js/src/ai/tools/tool-registry.service.ts` | 支持动态注册 KB/MCP 工具 |
| `study-nest-js/src/ai/tools/tool-prompt.service.ts` | 工具名示例更新 |
| `study-nest-js/src/conversation/conversation.controller.ts` | 路由 + AgentOrchestrator |

### 前端新建/修改

| 文件 | 变更 |
|------|------|
| `admin-web/components/chat/AgentStepBlock.tsx` | Agent 时间线 UI |
| `admin-web/services/ai.ts` | agent_* SSE 事件 |
| `admin-web/hooks/useChatMessages.ts` | agentSteps 状态 |
| `admin-web/components/chat/ChatMessageItem.tsx` | 展示 AgentStepBlock |
| `admin-web/app/chat/page.tsx` | 绑定 onAgent* 回调 |

---

## Task 1: 依赖与配置

**Files:**
- Modify: `study-nest-js/package.json`
- Modify: `study-nest-js/.env.dev`
- Modify: `study-nest-js/SETUP.md`

- [ ] **Step 1: 安装 MCP SDK**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm add @modelcontextprotocol/sdk
```

- [ ] **Step 2: `.env.dev` 追加**

```env
MCP_FILESYSTEM_ENABLED=true
MCP_FILESYSTEM_ROOTS=./docs,./uploads/kb
```

- [ ] **Step 3: SETUP.md 追加 MCP 章节**

说明需 Node 18+、`npx @modelcontextprotocol/server-filesystem` 由应用自动拉起；`MCP_FILESYSTEM_ROOTS` 为只读白名单。

- [ ] **Step 4: Commit**

```bash
git add study-nest-js/package.json study-nest-js/pnpm-lock.yaml study-nest-js/.env.dev study-nest-js/SETUP.md
git commit -m "chore: add MCP SDK and filesystem config for Agent"
```

---

## Task 2: Agent 常量与上下文类型

**Files:**
- Create: `study-nest-js/src/ai/agent/agent.constants.ts`
- Create: `study-nest-js/src/ai/agent/agent-context.type.ts`

- [ ] **Step 1: 创建常量文件**

```typescript
// agent.constants.ts
export const MAX_AGENT_STEPS = 5;
export const AGENT_ROUTER_FALLBACK_MODE = 'agent' as const;
export const MCP_TOOL_PREFIX = 'mcp_';
```

- [ ] **Step 2: 创建上下文类型**

```typescript
// agent-context.type.ts
export interface AgentContext {
  userId: number;
  role: string;
  knowledgeBaseIds: number[];
}

export type AgentRouteMode = 'direct' | 'agent';
```

- [ ] **Step 3: Commit**

```bash
git add study-nest-js/src/ai/agent/
git commit -m "feat(agent): add constants and context types"
```

---

## Task 3: AgentRouterService（TDD）

**Files:**
- Create: `study-nest-js/src/ai/agent/agent-router.service.ts`
- Create: `study-nest-js/src/ai/agent/agent-router.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { AgentRouterService } from './agent-router.service';

describe('AgentRouterService', () => {
  const aiService = { chat: jest.fn() };
  let service: AgentRouterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentRouterService(aiService as any);
  });

  it('问候语应路由为 direct', async () => {
    const mode = await service.route('你好');
    expect(mode).toBe('direct');
    expect(aiService.chat).not.toHaveBeenCalled();
  });

  it('复杂任务应路由为 agent', async () => {
    aiService.chat.mockResolvedValue({ thinking: '', response: '{"mode":"agent"}' });
    const mode = await service.route('读取 docs 目录下的设计文档并总结');
    expect(mode).toBe('agent');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm test -- --testPathPatterns=agent-router
```

Expected: FAIL — `AgentRouterService` not defined

- [ ] **Step 3: 实现路由服务**

```typescript
import { Injectable } from '@nestjs/common';
import { AiService } from '../ai.service';
import { resolveModelReply } from '../utils/reply.util';
import { AGENT_ROUTER_FALLBACK_MODE } from './agent.constants';
import { AgentRouteMode } from './agent-context.type';

const DIRECT_GREETING =
  /^(你好|hi|hello|在吗|谢谢|好的|嗯|哦)[!?？。~]*$/i;

@Injectable()
export class AgentRouterService {
  constructor(private readonly aiService: AiService) {}

  async route(query: string): Promise<AgentRouteMode> {
    const trimmed = query.trim();
    if (trimmed.length <= 12 && DIRECT_GREETING.test(trimmed)) {
      return 'direct';
    }

    const routerPrompt = [
      '判断用户消息是否需要多步工具推理。',
      '仅输出 JSON：{"mode":"direct"} 或 {"mode":"agent"}',
      'agent：查天气、读文件、查知识库、多步分析',
      'direct：闲聊、简单概念解释',
      '',
      `用户消息：${trimmed}`,
    ].join('\n');

    try {
      const reply = await this.aiService.chat(
        [{ role: 'user', content: routerPrompt }],
        null,
        { skipCache: true },
      );
      const resolved = resolveModelReply(reply.thinking, reply.response);
      const text = resolved.response || resolved.thinking;
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return AGENT_ROUTER_FALLBACK_MODE;
      const parsed = JSON.parse(match[0]) as { mode?: string };
      return parsed.mode === 'direct' ? 'direct' : 'agent';
    } catch {
      return AGENT_ROUTER_FALLBACK_MODE;
    }
  }
}
```

- [ ] **Step 4: 运行测试通过**

```powershell
pnpm test -- --testPathPatterns=agent-router
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(agent): add AgentRouterService with greeting fast-path"
```

---

## Task 4: searchKnowledgeBase 工具

**Files:**
- Create: `study-nest-js/src/ai/tools/implementations/knowledge-base-search.tool.ts`

- [ ] **Step 1: 实现工具工厂**

```typescript
import { RetrievalService } from '../../../knowledge-base/retrieval.service';
import { AgentContext } from '../../agent/agent-context.type';
import { ToolDefinition } from '../types/tool.type';

export function createKnowledgeBaseSearchTool(
  retrievalService: RetrievalService,
  getContext: () => AgentContext,
): ToolDefinition {
  return {
    name: 'searchKnowledgeBase',
    description: '从用户已选知识库中检索与问题相关的文档片段',
    parameters: [
      { name: 'query', description: '检索问题', required: true },
    ],
    execute: async (args) => {
      const ctx = getContext();
      if (!ctx.knowledgeBaseIds.length) {
        return '未选择知识库，请让用户在聊天页勾选知识库后重试。';
      }
      const chunks = await retrievalService.search(
        args.query,
        ctx.knowledgeBaseIds,
        { userId: ctx.userId, role: ctx.role },
      );
      return JSON.stringify({
        count: chunks.length,
        chunks: chunks.map((c) => ({
          documentName: c.documentName,
          page: c.page,
          content: c.content.slice(0, 500),
          score: c.score,
        })),
      });
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add study-nest-js/src/ai/tools/implementations/knowledge-base-search.tool.ts
git commit -m "feat(agent): add searchKnowledgeBase tool"
```

---

## Task 5: McpClientService

**Files:**
- Create: `study-nest-js/src/ai/mcp/mcp-client.service.ts`
- Create: `study-nest-js/src/ai/mcp/mcp-tool-bridge.service.ts`

- [ ] **Step 1: 实现 McpClientService**

核心逻辑：
- `onModuleInit`：若 `MCP_FILESYSTEM_ENABLED !== 'true'` 则跳过
- 解析 `MCP_FILESYSTEM_ROOTS`，resolve 为绝对路径并校验在 `process.cwd()` 下
- 使用 `Client` + `StdioClientTransport`，command `npx`，args `['-y', '@modelcontextprotocol/server-filesystem', ...roots]`
- 暴露 `listTools(): Promise<ToolDefinition[]>`、`callTool(name, args)`
- `onModuleDestroy`：关闭 transport

- [ ] **Step 2: 实现 McpToolBridgeService**

```typescript
@Injectable()
export class McpToolBridgeService implements OnModuleInit {
  constructor(
    private readonly mcpClient: McpClientService,
    private readonly registry: ToolRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.mcpClient.isEnabled()) return;
    const tools = await this.mcpClient.listTools();
    for (const tool of tools) {
      this.registry.register({
        ...tool,
        name: `${MCP_TOOL_PREFIX}${tool.name}`,
      });
    }
  }
}
```

MCP 原始 `read_file` → 注册为 `mcp_read_file`。

- [ ] **Step 3: 手动验证 MCP 可连接（开发机）**

启动 `pnpm run start:dev`，日志应出现 MCP tools 注册数量。

- [ ] **Step 4: Commit**

```bash
git add study-nest-js/src/ai/mcp/
git commit -m "feat(agent): add MCP filesystem client and tool bridge"
```

---

## Task 6: ToolRegistry 扩展 + Agent 上下文

**Files:**
- Modify: `study-nest-js/src/ai/tools/tool-registry.service.ts`
- Modify: `study-nest-js/src/ai/ai.module.ts`

- [ ] **Step 1: ToolRegistry 增加 AgentContext holder**

```typescript
private agentContext: AgentContext = {
  userId: 0,
  role: 'user',
  knowledgeBaseIds: [],
};

setAgentContext(ctx: AgentContext): void {
  this.agentContext = ctx;
}

getAgentContext(): AgentContext {
  return this.agentContext;
}
```

- [ ] **Step 2: onModuleInit 注册 KB 工具**

```typescript
this.register(
  createKnowledgeBaseSearchTool(this.retrievalService, () => this.getAgentContext()),
);
```

需在 constructor 注入 `RetrievalService` — `AiModule` import `KnowledgeBaseModule`。

- [ ] **Step 3: AiModule 更新**

```typescript
imports: [RedisModule, KnowledgeBaseModule],
providers: [
  // ...existing
  AgentRouterService,
  AgentOrchestratorService,
  McpClientService,
  McpToolBridgeService,
],
exports: [AiService, PromptTemplateService, AgentOrchestratorService, AgentRouterService],
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(agent): wire KnowledgeBase tool into ToolRegistry"
```

---

## Task 7: AgentOrchestratorService（TDD）

**Files:**
- Create: `study-nest-js/src/ai/agent/agent-orchestrator.service.ts`
- Create: `study-nest-js/src/ai/agent/agent-orchestrator.service.spec.ts`

- [ ] **Step 1: 写失败测试 — 无工具时直接完成**

```typescript
it('无工具调用时应流式输出并发送 agent_start/agent_done', (done) => {
  aiService.chat.mockResolvedValue({ thinking: '', response: '你好呀' });
  aiService.streamChat.mockReturnValue(
    of({ data: { response: '你好呀', done: true } } as MessageEvent),
  );

  const events: unknown[] = [];
  service
    .streamWithAgent([{ role: 'user', content: '你好' }], null, agentContext)
    .subscribe({
      next: (e) => events.push((e as MessageEvent).data),
      complete: () => {
        expect(events[0]).toMatchObject({ phase: 'agent_start' });
        expect(events.some((d: any) => d.done)).toBe(true);
        done();
      },
    });
});
```

- [ ] **Step 2: 写失败测试 — 单步工具后流式**

mock `chat` 第一次返回 `{"tool":"getWeather","city":"武汉"}`，第二次返回自然语言；`registry.execute` 返回 `武汉 31℃`。

- [ ] **Step 3: 实现 AgentOrchestratorService**

从 `ToolOrchestratorService` 演化：
- 入口 `streamWithAgent(messages, summary, agentContext)`
- 开始 `registry.setAgentContext(agentContext)`
- 发 `agent_start`
- 循环 `MAX_AGENT_STEPS`：非流式 chat → parse → tool 或 break
- 每步发 `agent_step` + `tool_call`/`tool_result`
- 最终 `streamChat`，发 `agent_done`

- [ ] **Step 4: 运行测试**

```powershell
pnpm test -- --testPathPatterns=agent-orchestrator
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(agent): add multi-step AgentOrchestratorService"
```

---

## Task 8: ConversationController 接入路由

**Files:**
- Modify: `study-nest-js/src/conversation/conversation.controller.ts`

- [ ] **Step 1: 扩展 StreamPayload phase 类型**

```typescript
phase?: 'agent_start' | 'agent_step' | 'agent_done' | 'tool_call' | 'tool_result' | 'rag_retrieval';
step?: number;
maxSteps?: number;
steps?: number;
```

- [ ] **Step 2: 注入 AgentRouterService + AgentOrchestratorService**

替换 `toolOrchestrator` 为 `agentOrchestrator` + `agentRouter`。

- [ ] **Step 3: prepareStream 内路由分支**

```typescript
const routeMode = await this.agentRouter.route(content);

if (routeMode === 'direct') {
  const aiStream = this.aiService.streamChat(ollamaMessages, conversation.summary);
  // 保留 rag_retrieval 先发逻辑
} else {
  const aiStream = this.agentOrchestrator.streamWithAgent(
    ollamaMessages,
    conversation.summary,
    { userId, role, knowledgeBaseIds },
  );
}
```

注意：`ollamaMessages` 来自 `contextBuilder`；Agent 路径仍保留 RAG 预注入（与工具化并存）。

- [ ] **Step 4: 手动验收**

```powershell
# 后端运行中
# GET /conversations/:id/stream?content=你好
# 应无 agent_start
# content=武汉天气 应有 tool_call
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(agent): integrate router and orchestrator in conversation stream"
```

---

## Task 9: 前端 SSE 解析扩展

**Files:**
- Modify: `admin-web/services/ai.ts`

- [ ] **Step 1: 扩展 StreamCallbacks**

```typescript
onAgentStart?: (payload: { maxSteps: number }) => void;
onAgentStep?: (payload: { step: number; maxSteps: number }) => void;
onAgentDone?: (payload: { steps: number }) => void;
```

- [ ] **Step 2: onmessage 内解析 agent_* phase**

```typescript
if (parsed.phase === 'agent_start' && parsed.maxSteps != null) {
  onAgentStart?.({ maxSteps: parsed.maxSteps });
  return;
}
if (parsed.phase === 'agent_step' && parsed.step != null && parsed.maxSteps != null) {
  onAgentStep?.({ step: parsed.step, maxSteps: parsed.maxSteps });
  return;
}
if (parsed.phase === 'agent_done') {
  onAgentDone?.({ steps: parsed.steps ?? 0 });
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add admin-web/services/ai.ts
git commit -m "feat(agent): parse agent SSE events on frontend"
```

---

## Task 10: useChatMessages Agent 步骤状态

**Files:**
- Modify: `admin-web/hooks/useChatMessages.ts`

- [ ] **Step 1: ChatMessage 类型增加 agentSteps**

```typescript
agentSteps?: Array<{
  step: number;
  type: 'step' | 'tool_call' | 'tool_result';
  tool?: string;
  args?: Record<string, string>;
  result?: string;
  error?: string;
}>;
```

- [ ] **Step 2: 新增方法**

- `startAgent(assistantId, maxSteps)` — 插入 `{ step: 0, type: 'step' }`
- `appendAgentStep(assistantId, step, maxSteps)`
- `appendAgentToolCall(assistantId, step, tool, args)` — 可与现有 `appendToolCall` 复用或合并
- `finishAgent(assistantId, steps)`

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(agent): add agentSteps state in useChatMessages"
```

---

## Task 11: AgentStepBlock UI

**Files:**
- Create: `admin-web/components/chat/AgentStepBlock.tsx`
- Modify: `admin-web/components/chat/ChatMessageItem.tsx`

- [ ] **Step 1: 创建 AgentStepBlock**

可折叠 Timeline，展示：
- 「Agent 开始（最多 N 步）」
- 每步：工具名、参数摘要、结果摘要（截断 120 字）
- loading 态：`toolCalls` 中有 `calling`

- [ ] **Step 2: ChatMessageItem 嵌入**

在 `ToolCallBlock` 上方或合并展示 `AgentStepBlock`。

- [ ] **Step 3: Commit**

```bash
git add admin-web/components/chat/
git commit -m "feat(agent): add AgentStepBlock timeline UI"
```

---

## Task 12: 聊天页绑定 Agent 回调

**Files:**
- Modify: `admin-web/app/chat/page.tsx`

- [ ] **Step 1: streamChat 增加回调**

```typescript
onAgentStart: ({ maxSteps }) => {
  const id = assistantIdRef.current;
  if (id == null) return;
  startAgent(id, maxSteps);
},
onAgentStep: ({ step, maxSteps }) => {
  const id = assistantIdRef.current;
  if (id == null) return;
  appendAgentStep(id, step, maxSteps);
},
onAgentDone: ({ steps }) => {
  const id = assistantIdRef.current;
  if (id == null) return;
  finishAgent(id, steps);
},
```

- [ ] **Step 2: 从 useChatMessages 解构新方法**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(agent): wire agent callbacks in chat page"
```

---

## Task 13: 构建与验收

**Files:** —

- [ ] **Step 1: 后端测试**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm test
pnpm run build
```

Expected: 全部 PASS

- [ ] **Step 2: 前端构建**

```powershell
Set-Location "d:\Note\NestJS\admin-web"
pnpm run build
```

- [ ] **Step 3: 手工验收清单**

| # | 操作 | 预期 |
|---|------|------|
| 1 | 「你好」 | direct，无 Agent 时间线 |
| 2 | 「武汉天气怎么样」 | agent，`getWeather`，有回答 |
| 3 | 勾选知识库 + 「年假几天」 | `searchKnowledgeBase` 或 RAG 引用 |
| 4 | 「列出 docs 目录文件」 | `mcp_list_directory` |
| 5 | 「读 docs/superpowers/specs 下 agent 设计并总结」 | 读文件 + 总结 |

- [ ] **Step 4: Commit（若有修复）**

```bash
git commit -am "chore(agent): build verification fixes"
```

---

## Task 14: 文档同步

**Files:**
- Modify: `study-nest-js/AI学习扩展.md`（可选勾选进度）

- [ ] **Step 1: 在 AI学习扩展.md 第二阶段标注**

```
- [x] Function Calling（多步 Agent）
- [x] MCP（filesystem 示范）
- [ ] LangGraph（第二期）
```

- [ ] **Step 2: Commit**

```bash
git add study-nest-js/AI学习扩展.md
git commit -m "docs: mark Agent and MCP phase-1 complete in learning roadmap"
```

---

## Spec 覆盖自检

| Spec 章节 | 对应 Task |
|-----------|-----------|
| ReAct 循环 | Task 7 |
| 智能路由 | Task 3, 8 |
| searchKnowledgeBase | Task 4, 6 |
| MCP filesystem | Task 1, 5 |
| SSE 协议 | Task 7, 8, 9 |
| 前端时间线 | Task 10, 11, 12 |
| 错误处理 | Task 5（MCP 降级）, Task 7（工具失败继续） |
| 验收用例 | Task 13 |

---

## 执行方式

**Plan 已保存至 `docs/superpowers/plans/2026-06-25-agent-integration.md`。两种执行方式：**

1. **Subagent-Driven（推荐）** — 每个 Task 派发独立 subagent，任务间 Review，迭代快
2. **Inline Execution** — 当前会话按 Task 顺序逐步实现，检查点 Review

**你希望用哪种方式开始实现？**
