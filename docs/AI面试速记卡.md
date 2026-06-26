# AI 面试速记卡

> 目标：前端开发转 AI 前端 / AI 应用开发面试  
> 使用方式：面试前快速背诵；被追问时按本卡片展开  
> 真实性原则：只把当前项目已有能力说成“已实现”，把增强项说成“优化方向”

---

## 1. 一句话定位

我是前端开发转 AI 应用开发，优势不是训练大模型，而是把 LLM、RAG、Agent、工具调用和业务系统做成用户真正能用的 AI 产品。

我的定位：

```text
AI 应用工程化 + AI 前端体验 + RAG/Agent 落地
```

---

## 2. 1 分钟项目介绍

这个项目是一个基于 NestJS 和 Next.js 的 Prompt RAG Agent 系统。

它不是简单调用大模型接口，而是实现了一条完整 AI 应用链路：前端支持 SSE 流式聊天、Prompt 模板选择、知识库选择、工具调用和 Agent 步骤展示；后端通过 `AiOrchestratorService` 把一次聊天请求拆成 Input、Context、Prompt、RAG、Tool、Stream 六个阶段。

RAG 层支持文档上传、解析、分块、Ollama Embedding、Qdrant 向量存储，以及向量检索和关键词检索的混合召回。复杂问题会进入 Agent 模式，通过 ReAct 循环调用工具，比如 `searchKnowledgeBase`，最后流式返回答案。

我重点学习和实践的是 AI 应用工程化：Prompt、RAG、Agent、上下文治理、流式体验、安全和权限。

---

## 3. 3 分钟架构讲法

```text
前端 Chat UI
  -> AIClient / StreamAdapter
  -> ConversationController
  -> AiOrchestratorService
  -> InputStage
  -> ContextStage
  -> PromptStage
  -> RagStage
  -> ToolStage
  -> StreamStage
  -> Direct LLM 或 Agent ReAct
  -> Ollama / Qdrant / MySQL / Redis
```

讲解顺序：

1. 前端负责 AI 交互体验：流式消息、工具调用卡片、Agent 时间线、知识库选择。
2. 后端 Controller 只做入口，不堆 AI 编排逻辑。
3. `AiOrchestratorService` 是统一调度器，把请求拆成六个 Stage。
4. `ContextEngineService` 把 Prompt、历史消息、summary、RAG、tool、memory 统一成 ContextBlock，再做 token budget 和裁剪。
5. `RetrievalService` 做 RAG 混合检索：Qdrant 向量召回 + MySQL 关键词召回。
6. `AgentOrchestratorService` 做多步 ReAct：判工具、执行工具、观察结果、最终回答。

Orchestrator 最新实现细节：

- `ContextStage` 先用 `skipPrompt/skipRag` 构建基础 ContextPlan。
- `PromptStage` 和 `RagStage` 再通过 `enrichPlan()` 追加 Prompt block 和 RAG blocks。
- `StreamStage` 通过 `startDetachedGeneration()` 启动后台生成，SSE 连接只负责观察 session。

---

## 4. 前端亮点怎么讲

### AI 前端不是普通 CRUD

普通后台是确定性数据展示；AI 前端面对的是流式、不确定、多阶段的生成过程。

我做的重点：

- SSE 流式消息处理。
- thinking / response 分区。
- 工具调用过程展示。
- Agent 多步骤时间线。
- 取消生成、重新生成、断线续传。
- Markdown 安全渲染。
- 知识库选择和检索预览引用展示。

### SSE 怎么讲

项目用 SSE，因为 AI 输出主要是服务端到客户端的单向推送。相比 WebSocket，SSE 协议更简单，浏览器原生支持 EventSource，适合 token 流式输出。

如果是多人协作、实时语音、客户端频繁发送控制指令，WebSocket 更合适。

### 断线续传怎么讲

后端用 `StreamSessionService` 在 Redis 中保存 stream session，包括 `streamId`、thinking、response、seq、status 等信息。前端拿到 `streamId` 后保存，连接中断时通过 `resumeStreamId` 继续观察原来的流会话。

流式控制 API：

- `GET /conversations/:id/stream/active`：查询进行中流式任务。
- `DELETE /conversations/:id/stream?streamId=...`：取消生成。
- `GET /conversations/:id/stream?streamId=...`：通过 streamId 续传。
- `GET /conversations/stats/token-usage`：查看 token 消耗统计。

---

## 5. RAG 怎么讲

### RAG 是什么

RAG 是 Retrieval-Augmented Generation，检索增强生成。

流程：

```text
文档
  -> 解析
  -> 分块
  -> Embedding
  -> Qdrant 向量库
  -> 用户提问
  -> query embedding
  -> 向量检索 + 关键词检索
  -> Top-K 片段
  -> 注入上下文
  -> 模型回答
```

### 为什么不能只用大模型

因为大模型不知道企业私有知识，知识可能过期，也容易幻觉。RAG 让模型回答前先查企业知识库，再基于检索资料回答。

### Chunk 怎么讲

项目默认：

```text
RAG_CHUNK_SIZE = 800
RAG_CHUNK_OVERLAP = 120
```

Chunk 太小会丢语义，太大又会带入无关内容并浪费 token。项目先按标题和段落切，再合并短段落，超长段落按句子切，最后回退滑动窗口。

### 混合检索怎么讲

项目不是只做向量检索，而是：

- Qdrant 做语义向量召回。
- MySQL 做关键词召回。
- `RetrievalService.mergeHybridScores()` 融合分数。
- 向量和关键词双命中的片段会加分。

这样比纯向量或纯关键词更稳。

### 引用真实性边界

当前项目知识库检索预览接口会返回 citations，前端 `CitationBlock` 可以展示文档名、页码、片段和相似度。

聊天主链路目前主要是把 RAG 片段注入上下文；如果要让每次聊天回答都稳定展示引用，还需要把 citations 作为 SSE 事件或结构化消息字段传给聊天页。

面试说法：

```text
检索预览 citations 已实现，聊天回答引用事件化展示是后续增强方向。
```

---

## 6. Agent 怎么讲

### Agent 是什么

Agent 不是一次性回答，而是：

```text
判断任务
  -> 决定是否调用工具
  -> 执行工具
  -> 观察结果
  -> 继续推理
  -> 最终回答
```

### Function Calling 和 Agent 的区别

Function Calling 更像一次工具调用。

Agent 是多步骤循环，可以多次调用工具、观察结果，再决定下一步。

项目早期有单轮工具路径，后续主链路接入 `AgentOrchestratorService`，支持最多 5 步 ReAct。

### Direct / Agent 路由

简单问题走 direct，复杂问题走 agent。

项目通过 `AgentRouterService` 做路由，短问候直接 direct，其余通过轻量 LLM prompt 判断 `direct` 或 `agent`，也支持 `AGENT_ROUTER_MODE` 强制配置。

### searchKnowledgeBase 工具

`searchKnowledgeBase` 复用 `RetrievalService.search()`，从用户已选知识库中检索相关片段。

真实返回结构：

```text
count
chunks: documentName / page / content / score
```

注意：它返回的是给模型继续推理用的 chunks，不等同于前端 citations 卡片。

---

## 7. Context Engine 怎么讲

问题：AI 上下文来源很多，不能简单拼 messages。

来源包括：

- system policy
- Prompt 模板
- summary
- 历史消息
- 当前用户消息
- RAG chunks
- tool results
- memory

项目做法：

```text
各种上下文
  -> ContextBlock
  -> TokenBudgetManager
  -> ContextPruningService
  -> ContextPlan
  -> ContextComposerService
  -> ChatMessage[]
```

面试表达：

```text
Context Engine 的价值是把不同来源的上下文统一治理，按优先级和 token budget 选择内容，避免长对话超 token，也能解释本轮为什么用了这些上下文。
```

### Memory 怎么讲

当前项目的 Memory 是基础版已实现能力：

- 通过 `POST /memories` 显式创建记忆。
- 通过 `GET /memories` 检索可访问记忆。
- 通过 `DELETE /memories/:id` 遗忘记忆。
- scope 是 `USER`、`CONVERSATION`、`GLOBAL`。
- `ContextEngineService` 构建 ContextPlan 时会按当前 query 检索 Memory，并转成 `ContextBlock(type=memory)`。

真实性边界：

```text
基础 Memory 已接入 ContextPlan；
自动从对话提取 Memory、Memory 向量检索还属于优化方向。
```

---

## 8. 安全怎么讲

AI 系统输入不可信，风险包括：

- Prompt Injection
- Tool Injection
- RAG Injection
- Markdown XSS
- 知识库权限越界

项目做法：

- `PromptGuardService` 校验和包裹用户输入。
- `ContextComposerService` 对 message、rag、tool、memory 等用户载荷做边界包裹。
- `ToolCallParserService` 只接受 knownTools。
- `ToolRegistryService` 执行前净化参数。
- `KnowledgeBaseService.findAccessible()` 在检索前做权限过滤。
- `ContentModerationService` 在 AI 回复落库前做敏感词拦截和手机号/身份证脱敏。
- 前端 message-ast 安全渲染，限制危险链接协议。

一句话：

```text
核心是区分系统指令和外部数据，不能让用户输入、RAG 文档或工具结果反过来控制模型行为。
```

---

## 9. 真实性边界

### 可以说已实现

- SSE 流式聊天和 streamId 续传。
- Prompt 模板。
- Function Calling Prompt JSON 方案。
- weather 工具，支持 mock，配置 API key 可查 OpenWeather。
- RAG 文档入库。
- Qdrant 向量检索。
- MySQL 关键词检索。
- 混合检索。
- 知识库检索预览 citations。
- Agent ReAct，最多 5 步。
- `searchKnowledgeBase` 工具。
- Context Engine。
- 基础 Memory REST API + ContextPlan 集成。
- PromptGuard。
- ContentModeration 输出审核。
- 流式控制 API：active stream、取消生成、streamId 续传、token 统计。
- MCP filesystem 示例。

### 要说成优化方向

- 聊天回答稳定展示 RAG 引用。
- 独立 rerank 阶段。
- Stream Event Bus。
- Agent step 持久化。
- 更多 MCP 企业连接器。
- LangGraph 工作流。
- Memory 自动提取和 Memory 向量检索。

---

## 10. 高频追问回答

### 为什么不用全文塞 Prompt？

文档太大，会超 token，成本高，速度慢，还会引入大量无关内容。RAG 只取最相关片段，效率和准确率都更好。

### 为什么 Chunk 要 overlap？

避免语义在边界处断裂。相邻 Chunk 保留少量重叠，可以让模型拿到更完整的上下文。

### 为什么向量检索还要关键词检索？

向量检索理解语义，但可能误召回；关键词检索精确，但不理解同义表达。混合检索兼顾语义和精确命中。

### 如何减少幻觉？

检索层提高召回质量；Prompt 层要求基于检索资料回答；资料不足时明确说不知道；展示层通过 citations 让用户验证来源。

### 如何提升响应速度？

减少不必要的 Agent 路由调用，缓存常见检索结果，embedding 批处理或缓存，控制 RAG Top-K，简单问题走 direct。

### 你作为前端为什么能做 AI 应用开发？

我的优势是把 AI 能力做成产品。我熟悉前端交互、组件化、状态管理和流式 UI，也补齐了后端 AI 链路，包括 Prompt、RAG、Agent、向量检索和上下文治理。

---

## 11. 简历短句

AI 前端版本：

```text
基于 Next.js 实现 AI Chat 交互，支持 SSE 流式输出、工具调用过程展示、Agent 执行步骤时间线、Prompt 模板选择和知识库检索预览引用展示。
```

AI 应用开发版本：

```text
基于 NestJS 构建 Prompt RAG Agent 系统，实现 AI Orchestrator、Context Engine、RAG 文档入库与混合检索、Prompt JSON 工具调用和多步 ReAct Agent。
```

综合版本：

```text
从前端交互到后端 AI 编排完整实践 RAG Agent 应用链路，覆盖流式聊天、Prompt 模板、知识库检索、工具调用、Agent 时间线、上下文治理和 Prompt 安全。
```

---

## 12. 最后记住

面试时不要只说“我用了某技术”，要说“我解决了什么问题”。

- 不说“我用了 SSE”，说“我用 SSE 降低 AI 生成等待感”。
- 不说“我用了 Qdrant”，说“我用向量数据库解决企业文档语义检索问题”。
- 不说“我用了 Agent”，说“我让模型能根据任务主动调用工具并多步完成复杂问题”。
- 不说“我写了 Prompt”，说“我把 Prompt 模板化，保证不同场景输出稳定可控”。

核心定位：

```text
前端工程经验
  + AI 交互体验
  + RAG
  + Agent
  + Context 编排
  + 安全和权限
  = AI 应用开发竞争力
```
