# Context Engine 设计

> 日期：2026-06-26  
> 范围：P0/P1/P2 全量升级，覆盖 token budget、message 压缩、长对话裁剪、短期/长期 memory、context trace

## 1. 背景

当前项目已经具备基础上下文能力：

- `ContextBuilderService`：组装 system prompt、模板 prompt、摘要与最近消息
- `SummaryService`：基于 `Conversation.summary` 和 `summarizedMessageId` 做滚动摘要
- `RetrievalService`：基于知识库权限做 RAG 检索
- `ToolOrchestratorService` / `AgentOrchestratorService`：负责工具调用和多步 Agent
- `PromptGuardService`：负责用户输入安全边界

这些能力目前仍然分散在会话流、摘要流、RAG 流和工具流中。目标是引入统一的 `ContextEngine`，把上下文来源、预算、压缩、裁剪、Memory、Trace 统一治理起来。

## 2. 总体目标

| 阶段 | 目标 | 结果 |
|------|------|------|
| P0 | 补 Context Engine 骨架 | 所有模型请求先生成 `ContextPlan`，再组合为模型 messages |
| P1 | 补长对话与压缩 | summary 分层、recent messages 策略裁剪、RAG/Tool/Message 预算分配、context trace |
| P2 | 补 Memory | 短期 memory、长期 memory、权限控制、检索与遗忘机制 |

核心原则：

- 兼容现有链路，不一次性推翻 `ContextBuilderService`
- 先统一抽象，再逐步替换内部实现
- Token 预算优先于固定消息条数
- Memory 必须带权限、来源、过期和遗忘机制
- Trace 必须能解释“本次为什么用了这些上下文”

## 3. 架构

```text
ConversationController
  └─ ContextEngineService
      ├─ ContextSourceCollector
      │   ├─ System / Safety Policy
      │   ├─ Prompt Template
      │   ├─ Conversation Summary
      │   ├─ Recent Messages
      │   ├─ RAG Chunks
      │   ├─ Tool Results
      │   └─ Memory
      ├─ TokenBudgetManager
      ├─ ContextCompressionService
      ├─ ContextPruningService
      ├─ ContextComposer
      └─ ContextTraceService

AI Runtime
  ├─ ToolOrchestratorService
  ├─ AgentOrchestratorService
  └─ AiService / Model Provider
```

`ConversationController` 不再直接决定如何拼装上下文，只负责提供本轮请求上下文输入，例如当前用户、会话、消息、promptId、knowledgeBaseIds、工具结果等。

## 4. P0：Context Engine 骨架

### 4.1 ContextBlock

`ContextBlock` 是统一上下文单元，所有来源都必须转换为 block 后进入预算与裁剪。

```text
ContextBlock
  id: string
  type: system | policy | prompt | summary | message | rag | tool | memory
  role: system | user | assistant
  content: string
  priority: number
  estimatedTokens: number
  source: string
  metadata: object
```

优先级建议：

| 类型 | 优先级 | 说明 |
|------|--------|------|
| system / policy | 100 | 永远保留 |
| current user message | 95 | 永远保留 |
| prompt template | 90 | 选中模板时保留 |
| summary | 80 | 长对话核心压缩信息 |
| recent messages | 70 | 最近上下文 |
| memory | 60 | 用户/组织记忆 |
| rag | 55 | 知识库召回 |
| tool result | 50 | 工具结果 |
| older messages | 30 | 可裁剪 |

### 4.2 ContextPlan

`ContextPlan` 是本轮请求的上下文计划。

```text
ContextPlan
  requestId: string
  conversationId: number
  userId: number
  model: string
  budget:
    maxTokens
    reservedForResponse
    availableForContext
  blocks:
    selected
    dropped
  traceId: string
```

P0 阶段先不改变最终模型接口，只保证所有上下文先进入 `ContextPlan`，再由 `ContextComposer` 生成 `ChatMessage[]`。

### 4.3 TokenBudgetManager

Token 预算采用保守估算，不引入复杂 tokenizer：

```text
estimatedTokens = ceil(content.length / 3)
```

默认预算：

| 项 | 默认值 |
|----|--------|
| maxTokens | 8192 |
| reservedForResponse | 2048 |
| availableForContext | 6144 |

P0 先支持固定配置，后续可以按模型动态加载。

### 4.4 ContextComposer

职责：

- 按 priority 和原始顺序组合 block
- 给用户输入、RAG 内容、工具结果、Memory 添加安全边界
- 输出 `ChatMessage[]`
- 保持现有 `AiService.chat()` / `streamChat()` 调用方式不变

### 4.5 ConversationSummary 接入

P0 复用现有字段：

- `Conversation.summary`
- `Conversation.summarizedMessageId`

不新增 summary 表，避免第一阶段 migration 风险。`SummaryService` 保持现有行为，但 `ContextEngine` 会把 summary 转成 `ContextBlock(type=summary)`。

## 5. P1：长对话与压缩

### 5.1 Summary 分层

P1 引入逻辑分层，不一定马上新增数据库表：

```text
Rolling Summary
  会话滚动摘要，沿用 Conversation.summary

Topic Summary
  当前会话中主要主题和上下文

Decision Summary
  用户确认过的结论、约束、未完成事项
```

第一阶段可以把三层 summary 合并存入现有 `summary` 文本中，格式化为：

```text
【滚动摘要】
用户核心诉求、已回答内容、当前对话背景

【主题摘要】
按主题归纳的关键事实、涉及的知识库、重要引用

【决策与待办】
用户已确认的结论、约束条件、未完成任务、后续需要保持的偏好
```

后续如果需要更强检索，再迁移为独立表。

### 5.2 Recent Messages 策略裁剪

替代单纯 `RECENT_COUNT` 的固定条数裁剪。

保留规则：

- 当前用户消息必须保留
- 最近 2-4 轮优先保留
- 用户消息优先于 assistant thinking
- assistant thinking 可以降权或剥离
- 已被 summary 覆盖的旧消息优先裁剪
- tool result 超长时压缩为观察摘要

### 5.3 RAG / Tool / Message 预算分配

建议默认预算：

| 类型 | 占比 | 说明 |
|------|------|------|
| system / policy / prompt | 固定优先 | 不参与比例竞争 |
| summary | 20% | 长对话压缩信息 |
| recent messages | 35% | 最近对话 |
| RAG | 25% | 知识库召回 |
| tool result | 10% | 工具结果 |
| memory | 10% | 短期/长期记忆 |

如果某类为空，其预算可释放给 recent messages 和 RAG。

### 5.4 Context Trace

每次请求生成 trace，用于调试和审计。

```text
ContextTrace
  traceId
  requestId
  conversationId
  selectedBlocks
  droppedBlocks
  tokenUsageEstimate
  budgetPolicy
  createdAt
```

P1 初期 trace 可以写日志或返回内部对象；后续可落库。

## 6. P2：Memory

### 6.1 Memory 类型

短期 memory：

- 当前会话状态
- 当前任务状态
- 工具执行状态
- 当前知识库选择
- 当前 Prompt Template
- 未完成事项

长期 memory：

- 用户偏好
- 历史结论
- 常用知识库
- 组织上下文
- 可复用任务经验

### 6.2 数据模型

新增 `Memory` 表：

```text
Memory
  id
  ownerUserId
  scope: private | team | org
  type: short_term | long_term
  category: preference | fact | decision | task | tool_state | org_context
  content
  sourceConversationId
  sourceMessageId
  importance
  expiresAt
  deletedAt
  createdAt
  updatedAt
```

索引：

```text
ownerUserId + type + updatedAt
scope + category + updatedAt
expiresAt
deletedAt
```

### 6.3 Memory 权限控制

读取规则：

- `private`：仅本人可读
- `team`：同角色用户可读
- `org`：登录用户可读
- `admin`：管理员可读写全部

写入规则：

- 普通用户只能写自己的 `private` memory
- team/org memory 需要 admin 或后续组织权限
- 自动提取的 long-term memory 默认进入 private

### 6.4 Memory 检索

P2 初期不强制接向量库，先用结构化过滤 + 关键词匹配：

```text
输入：userId, role, query, type, category
输出：按 importance、更新时间、关键词匹配排序的 memory blocks
```

后续可复用 embedding + qdrant，将长期 memory 向量化。

### 6.5 Memory 遗忘机制

支持四种遗忘：

- 用户主动删除：设置 `deletedAt`
- 过期遗忘：`expiresAt < now`
- 低价值淘汰：importance 低且长期未命中
- 覆盖更新：同类偏好发生变化时更新旧 memory

## 7. 接入策略

### 7.1 Conversation 流

当前：

```text
ConversationController
  → ContextBuilderService.build()
  → ToolOrchestratorService.streamWithTools()
```

升级后：

```text
ConversationController
  → ContextEngineService.buildPlan()
  → ContextComposer.compose()
  → ToolOrchestratorService.streamWithTools()
```

`ContextBuilderService` 先保留，作为兼容 facade 或内部调用迁移目标。

### 7.2 RAG 接入

普通聊天流需要显式接入 `knowledgeBaseIds`：

```text
request.knowledgeBaseIds
  → RetrievalService.search()
  → ContextBlock(type=rag)
  → TokenBudgetManager
```

工具中的知识库检索仍可保留，但普通 RAG 不应只依赖 tool 调用。

### 7.3 Tool 接入

工具结果进入 `ContextBlock(type=tool)`：

- 决策轮可以使用完整工具结果
- 最终回答轮使用压缩后的工具观察
- 超预算时优先压缩，而不是直接丢弃

### 7.4 Frontend 接入

前端 P0 不需要大改：

- 保留 `streamChat` 请求结构
- 继续传 `knowledgeBaseIds`
- 后续可增加 debug 模式展示 `contextTraceId`

## 8. 测试策略

### P0 测试

- `TokenBudgetManager` 能按预算选择高优先级 block
- `ContextComposer` 能输出合法 `ChatMessage[]`
- summary 被转换成 `summary` block
- 当前用户消息超预算也必须保留

### P1 测试

- 长对话下优先保留 summary + recent messages
- RAG 和 tool result 按预算进入 plan
- dropped blocks 进入 trace
- assistant thinking 可被降权或裁剪

### P2 测试

- private memory 仅本人可读
- team memory 同角色可读
- deleted / expired memory 不可读
- memory 检索按 importance 和相关性排序
- long-term memory 能进入 ContextPlan

## 9. 风险与约束

- Prisma schema 变更会引入 migration，需要确保本地数据库状态可迁移
- token 估算不是精确 tokenizer，P0 只做保守估算
- Memory 自动提取容易污染，需要先从显式写入和规则提取开始
- context trace 可能包含敏感上下文，默认不暴露给普通前端用户
- P0/P1/P2 全量推进改动较大，必须按任务拆分并逐步验证

## 10. 交付顺序

1. P0：新增 Context Engine 类型、预算、Composer、Plan，并接入 conversation 流
2. P1：增强 Summary 分层、裁剪策略、RAG/Tool/Message 预算、Trace
3. P2：新增 Memory schema、service、权限、检索、遗忘机制
4. 集成验证：普通聊天、长对话、RAG、Tool、Memory 权限、SSE 生成
