# AI RAG Agent 系统学习文档

> 适用项目：Prompt RAG Agent  
> 适用目标：面试讲清楚项目、从零复刻系统、系统掌握 AI 应用工程知识  
> 技术栈范围：NestJS、Next.js、Ollama、Qdrant、MySQL、Redis、Prisma、SSE、Prompt、RAG、Agent、MCP filesystem 示例

---

## 0. 如何阅读这份文档

这份文档不是代码说明书，而是一份“学习路线 + 项目知识地图”。

推荐阅读顺序：

1. 先理解项目为什么从普通 AI Chat 演进到 RAG Agent。
2. 再按模块学习：Prompt、Function Calling、RAG、Agent、Context Engine、Orchestrator。
3. 最后用“从零实现路线”复盘整个系统。

### 关于 git log 顺序

当前仓库没有可读取的正式提交历史，`git log` 没有返回提交记录，`HEAD` 也不存在。因此这里采用项目现有设计文档的时间线和功能落地顺序来还原“类似提交演进顺序”：

```text
2026-06-11  会话管理、聊天前端性能
2026-06-17  Prompt 模板、Function Calling
2026-06-25  RAG 知识库、安全体系、Agent 集成、前端 AI 工程化
2026-06-26  Context Engine、AI Orchestrator、Stream Event Bus 设计
```

学习时不要一开始就看最终架构。更好的方式是跟着项目演进顺序理解：系统为什么一步步变复杂，每一步解决了什么问题。

### 真实性边界

这份文档按“当前代码已存在能力 + 项目设计文档 + 面试扩展方向”组织。为了面试表达真实可靠，后文默认遵循以下边界：

1. **已实现**：可以在当前代码中找到对应模块或组件，例如 `AiOrchestratorService`、`RetrievalService`、`AgentOrchestratorService`、`PromptTemplatePicker`。
2. **设计中/优化方向**：设计文档中出现但当前代码未形成稳定实现的能力，会明确写成“优化方向”或“后续可扩展”，例如 Stream Event Bus、rerank、Agent 步骤持久化。
3. **MCP 范围**：当前项目落点是 filesystem MCP 示例，通过 `McpClientService` 和 `McpToolBridgeService` 接入；数据库、CRM、ERP 等企业连接器属于 MCP 的扩展方向，不应说成本项目已经完成。
4. **RAG 引用范围**：当前项目有知识库检索预览的 `CitationBlock` 和消息 AST 引用块类型；聊天主链路主要是把 RAG 片段注入上下文，未看到稳定的 `rag_retrieval` SSE 事件贯穿聊天页展示，所以面试时要区分“检索预览引用已实现”和“聊天回答引用事件化展示可继续完善”。

---

# 第一部分：项目全局认知

## 第1章 项目到底是什么

这个项目本质上是一个企业级 AI 应用系统，而不是简单的聊天机器人。

它包含三条核心能力：

1. AI Chat：用户可以和本地大模型流式对话。
2. RAG：用户可以上传企业知识文档，系统检索相关片段辅助回答。
3. Agent：模型可以根据问题决定是否调用工具，完成多步骤任务。

最终链路可以概括为：

```text
用户输入
  -> 会话与权限校验
  -> 上下文规划
  -> Prompt 模板注入
  -> RAG 知识检索
  -> Direct / Agent 路由
  -> LLM 生成
  -> SSE 流式返回
  -> 前端展示回答和工具步骤；知识库检索预览/结构化消息可展示引用
```

### 为什么需要这样的系统

如果只做“用户输入 -> 大模型回答”，系统会有明显短板：

- 不知道企业私有知识。
- 无法查询外部实时信息。
- 长对话会超出模型上下文。
- Prompt、RAG、工具、安全逻辑会散落在业务代码里。
- 面对复杂任务时只能回答，不能行动。

所以项目逐步演进出了 RAG、Prompt 模板、工具调用、Agent、Context Engine 和 Orchestrator。

### 生活类比

大模型像一个聪明老师；RAG 是教材和资料库；Agent 是能跑腿查资料的助教；Context Engine 是课堂材料整理员；Orchestrator 是教务主任，负责安排每一步流程。

---

## 第2章 项目模块总览

后端核心目录：

```text
study-nest-js/src
  ai/
    orchestrator/       AI 统一编排器
    agent/              Agent 路由与 ReAct 循环
    tools/              工具注册、工具 Prompt、JSON 解析
    prompts/            Prompt 模板 JSON
    mcp/                MCP filesystem 工具桥接
  context-engine/       上下文规划、预算、裁剪、拼接
  knowledge-base/       知识库、文档、Chunk、检索
  embedding/            Ollama Embedding
  vector/               Qdrant 向量库封装
  conversation/         会话、SSE、流式生成、摘要、标题
  security/             Prompt 注入防护、内容安全
  prisma/               数据库访问
```

前端核心目录：

```text
admin-web
  app/chat/                         聊天页面
  components/chat/                  消息、工具调用、Agent 步骤、引用相关 UI
  lib/ai/                           SSE 客户端和流适配
  components/chat/KnowledgeBasePicker.tsx
  components/chat/PromptTemplatePicker.tsx
```

### 需要掌握的基础知识

- NestJS Module / Controller / Service / DI。
- Prisma schema、relation、migration。
- MySQL 基础表设计与索引。
- Redis session / cache / stream snapshot 思路。
- SSE 流式响应。
- Next.js App Router。
- React 状态管理和流式 UI 渲染。
- Docker Compose 服务编排。

### 系统中的对应实现

- `ConversationController`：聊天 SSE 入口。
- `AiOrchestratorService`：统一调度入口。
- `ContextEngineService`：上下文计划生成。
- `RetrievalService`：RAG 检索核心。
- `AgentOrchestratorService`：多步 Agent 调度。
- `ConversationStreamService`：流式生成与断线续传。

### 生活类比

项目结构像一家餐厅。前端是服务员，后端是后厨，数据库是仓库，RAG 是菜谱资料库，Agent 是能帮厨师外出采购的助手，Orchestrator 是后厨总控。

---

# 第二部分：按项目演进顺序学习

## 第3章 第一阶段：基础 AI Chat

对应时间线：2026-06-11 会话管理、聊天前端性能。

### 要解决的问题

最开始系统要先具备基础聊天能力：

- 用户能登录。
- 用户能创建会话。
- 用户消息能保存。
- AI 回复能保存。
- 模型输出能流式展示。
- 长回答过程中用户能看到实时增量。

### 需要掌握的知识点

#### 1. SSE

SSE 是 Server-Sent Events，适合服务端持续向浏览器推送文本事件。

要掌握：

- `Content-Type: text/event-stream`
- EventSource 客户端消费方式
- 流式 delta 和最终 done 事件
- 断线重连和快照恢复
- SSE 与 WebSocket 的区别

为什么这里用 SSE：

- AI 输出是服务端单向推送，SSE 比 WebSocket 简单。
- 浏览器原生支持 EventSource。
- 更适合 token 流式输出。

项目对应实现：

- 后端：`ConversationController`
- 后端：`ConversationStreamService`
- 前端：`admin-web/lib/ai/AIClient.ts`
- 前端：`admin-web/lib/ai/StreamAdapter.ts`

生活类比：

SSE 像餐厅叫号屏，后厨不断把最新进度推给顾客，顾客不用反复去问。

#### 2. 会话系统

要掌握：

- Conversation 与 Message 的关系。
- user / assistant role 区分。
- 首条消息生成标题。
- 历史消息加载。
- regenerate 重新生成。
- message limit 限制。

为什么需要：

AI Chat 不是一次性请求，而是多轮对话。没有会话系统，模型无法理解上下文，用户也无法回看历史。

生活类比：

会话像病历本，每次看病都要带上以前的诊断记录。

#### 3. 本地模型调用

要掌握：

- Ollama `/api/chat`
- messages 数组格式
- system / user / assistant role
- stream 与非 stream 调用差异
- thinking / response 解析
- 缓存策略

为什么需要本地模型：

- 学习成本低。
- 不依赖云端 API。
- 便于演示私有化部署。

生活类比：

云模型像外包专家，本地 Ollama 像公司内部专家，响应和数据都在自己环境里。

---

## 第4章 第二阶段：Prompt 模板工程

对应时间线：2026-06-17 Prompt 模板设计。

### 要解决的问题

如果所有 Prompt 都写死在代码中，会出现几个问题：

- 不同场景的提示词难复用。
- 角色、任务、约束散落在业务逻辑里。
- 前端无法展示可选择的 AI 能力。
- 后续维护 Prompt 成本高。

所以项目引入 Prompt 模板。

### 需要掌握的知识点

#### 1. Prompt 五段式结构

一个可维护的 Prompt 通常包含：

- Role：你是谁。
- Task：你要做什么。
- Context：你基于什么材料回答。
- Constraint：你必须遵守什么限制。
- Output Format：你按什么格式输出。

项目中的模板结构：

```json
{
  "id": "frontend-interviewer",
  "name": "前端面试官",
  "description": "根据技术栈生成中级面试题",
  "role": "你是一名资深前端面试官",
  "task": "请根据用户技术栈生成面试题",
  "contextLabel": "用户技术栈",
  "constraints": ["难度中级", "不要给答案"],
  "outputFormat": "Markdown格式"
}
```

#### 2. System Prompt 组装

项目通过 `PromptTemplateService.buildSystemPrompt()` 把模板组装为 system message。

需要理解：

- system prompt 权限高于 user message。
- system prompt 适合放角色、任务、规则。
- 用户输入不能覆盖 system 规则。

#### 3. 会话绑定模板

首条消息可以绑定 prompt template，后续多轮对话继续沿用同一模板。

为什么需要：

如果用户进入“前端面试官”模式，后续追问也应该保持这个角色，而不是每一轮都重新选择。

生活类比：

Prompt 模板像“课程教案模板”。老师不会每次上课都重新设计课程结构，而是选定一个教学模板，再填入具体内容。

### 项目对应实现

- `study-nest-js/src/ai/prompt-template.service.ts`
- `study-nest-js/src/ai/prompts/*.json`
- `PromptStage`
- `ContextEngineService.buildPromptBlock()`

### 学习检查

你需要能回答：

1. 为什么 Prompt 要模板化？
2. system message 和 user message 有什么区别？
3. Prompt 模板为什么不要直接写在前端？
4. 如何新增一个 Prompt 模板？

---

## 第5章 第三阶段：Function Calling

对应时间线：2026-06-17 Function Calling 设计。

### 要解决的问题

基础聊天只能基于模型已有知识回答，不能查询实时信息，也不能调用业务系统。

例如用户问“武汉天气”，模型如果只靠训练知识回答，很可能不准确。系统需要让模型表达“我要调用天气工具”。

### 需要掌握的知识点

#### 1. Tool Calling 基本思想

模型不直接执行工具，而是输出结构化调用意图：

```json
{"tool":"weather","city":"武汉"}
```

后端解析后执行工具，再把结果交给模型组织自然语言回答。

#### 2. Prompt JSON 方案

当前项目使用 Prompt 约定 JSON，而不是 Ollama 原生 tool_calls。

优点：

- 实现简单。
- 不依赖模型原生工具调用能力。
- 适合学习工具调用原理。

缺点：

- JSON 解析需要自己做容错。
- 模型可能输出 Markdown 或多余文字。
- 参数类型校验能力不如原生 tool schema。

#### 3. 工具注册表

工具注册表负责管理系统有哪些工具。

需要掌握：

- 工具名称唯一。
- 工具描述提供给模型。
- 参数说明提供给模型。
- 执行前要校验工具是否存在。
- 工具参数要安全净化。

#### 4. 两轮调用

典型流程：

```text
第一轮：模型判断是否需要工具
  -> 如果输出 JSON，后端执行工具
  -> 第二轮：模型基于工具结果生成最终回答
```

为什么需要两轮：

第一轮是“决策”，第二轮是“表达”。把两者分开，用户不会看到中间 JSON，体验更稳定。

生活类比：

用户问前台“今天武汉天气如何”，前台先让同事查天气系统，再把查到的信息用人话告诉用户。

### 项目对应实现

- `ToolPromptService`
- `ToolCallParserService`
- `ToolRegistryService`
- `weather.tool.ts`
- `ToolCallBlock.tsx`

### 学习检查

你需要能回答：

1. 为什么模型不能直接执行工具？
2. Prompt JSON 工具调用和原生 tool_calls 有什么区别？
3. 为什么工具必须有白名单？
4. 为什么工具调用结果还要再交给模型生成最终回答？

---

## 第6章 第四阶段：RAG 知识库

对应时间线：2026-06-25 RAG 知识库设计。

### 要解决的问题

企业 AI 系统最常见的问题是：大模型不知道企业内部资料。

例如：

- 公司制度
- 产品文档
- 项目规范
- 客户 FAQ
- 研发文档

这些内容不在模型训练数据里，也不能全部塞进 Prompt。RAG 的目标就是让模型回答前先查资料。

### 需要掌握的知识点

#### 1. 文档解析

上传文档后，系统要先把文件变成文本。

需要掌握：

- TXT / Markdown 直接读取文本。
- PDF 需要解析页内容。
- DOCX 需要提取 raw text。
- 文件大小、MIME 类型、安全校验。
- 文档处理状态：pending / processing / ready / failed。

项目对应实现：

- `IngestService`
- `parsers/text.parser.ts`
- `parsers/pdf.parser.ts`
- `parsers/docx.parser.ts`

生活类比：

文档解析像把纸质书扫描成可搜索的电子文本。

#### 2. Chunking 分块

长文档不能整体向量化和整体塞给模型，需要切成小片段。

项目策略：

- 默认 `RAG_CHUNK_SIZE = 800`
- 默认 `RAG_CHUNK_OVERLAP = 120`
- 先按段落和标题切。
- 短段落合并。
- 超长段落按句号切。
- 仍然超长时回退滑动窗口。

为什么需要 overlap：

如果一句话跨越两个 Chunk 边界，完全切断会丢上下文。Overlap 让相邻片段保留少量重叠，减少语义断裂。

项目对应实现：

- `ChunkService`
- `knowledge-base/constants.ts`

生活类比：

复印资料时，每页交界处多复印几行，避免下一页开头看不懂。

#### 3. Embedding

Embedding 是把文本转换成向量。

需要掌握：

- 文本向量表示。
- 语义相似度。
- query embedding 与 document embedding。
- embedding 模型和聊天模型可以不同。

项目对应实现：

- `EmbeddingService`
- Ollama `/api/embeddings`
- 默认 `nomic-embed-text`

生活类比：

Embedding 像给每段文字生成一个“语义坐标”，意思相近的内容在地图上距离更近。

#### 4. 向量数据库

向量数据库负责存储和搜索向量。

需要掌握：

- collection
- point id
- vector size
- cosine similarity
- payload
- filter
- topK

项目对应实现：

- `QdrantService`
- collection：`knowledge_base_chunks`
- distance：Cosine
- payload：`chunkId`、`documentId`、`knowledgeBaseId`、`ownerId`、`visibility`

生活类比：

普通数据库像按书名查书，向量数据库像按“这段话意思像什么”查资料。

#### 5. 混合检索

项目不是只做向量检索，还做了关键词检索。

流程：

```text
用户问题
  -> query embedding
  -> Qdrant 向量召回
  -> MySQL 关键词召回
  -> 融合分数
  -> 阈值过滤
  -> Top-K Chunk
```

关键配置：

- `RAG_VECTOR_CANDIDATES = 24`
- `RAG_KEYWORD_TOP_K = 16`
- `RAG_TOP_K = 8`
- `RAG_SCORE_THRESHOLD = 0.55`
- `RAG_HYBRID_BOOST = 0.12`

为什么需要混合检索：

- 向量检索能理解语义。
- 关键词检索能保证精确词命中。
- 混合后能减少误召回。

项目对应实现：

- `RetrievalService.search()`
- `mergeHybridScores()`
- `extractQueryKeywords()`
- `scoreKeywordMatch()`

生活类比：

找资料时，一边问图书管理员“有没有类似这个意思的书”，一边自己按关键词搜索目录。

#### 6. 引用与可解释性

RAG 不应该只给答案，还应该给出处。

需要掌握：

- citation
- snippet
- documentName
- page
- score

为什么需要引用：

- 降低幻觉。
- 用户可以验证答案来源。
- 企业场景需要审计。

项目对应实现：

- `RetrievalService.toCitations()`
- `CitationBlock.tsx`：用于知识库检索预览。
- `message-ast` 中的 citation block：前端已有结构化引用块渲染能力。

真实性说明：

当前聊天主链路的 RAG Stage 主要负责把检索片段注入模型上下文；知识库详情页检索预览已经能展示 citations。若要让每次聊天回答都稳定展示引用，还需要把 RAG citations 从后端 Pipeline 作为 SSE 事件或结构化消息字段传到聊天页。

### 学习检查

你需要能回答：

1. RAG 为什么要分离“入库”和“检索”？
2. Chunk 太大和太小分别有什么问题？
3. Embedding 模型和聊天模型有什么区别？
4. Qdrant payload 为什么要保存业务字段？
5. 为什么要做向量 + 关键词混合检索？

---

## 第7章 第五阶段：安全体系

对应时间线：2026-06-25 安全体系设计。

### 要解决的问题

AI 系统的输入不可信。用户输入、RAG 文档、工具返回结果都可能包含恶意指令。

典型风险：

- Prompt Injection：让模型忽略系统指令。
- Tool Injection：用户伪造工具 JSON。
- RAG Injection：文档里写“忽略之前所有规则”。
- Markdown XSS：输出危险链接。
- 权限越界：检索到不该看的知识库。

### 需要掌握的知识点

#### 1. Prompt Injection 防护

系统要区分“指令”和“数据”。

用户输入应该被包裹为数据，而不是任由它影响 system prompt。

项目对应实现：

- `PromptGuardService.validateUserInput()`
- `PromptGuardService.wrapForModel()`

生活类比：

用户填表时写“请无视公司制度”，这只是表单内容，不应该真的让审批系统无视制度。

#### 2. 工具调用安全

工具调用必须满足：

- 工具名在 knownTools 里。
- 参数经过 sanitize。
- 用户不能直接伪造工具 JSON 绕过系统。
- 工具执行依赖当前用户上下文。

项目对应实现：

- `ToolCallParserService`
- `ToolRegistryService.sanitizeToolArgs`
- `AgentContext`

#### 3. 知识库权限

知识库可见性：

- private
- team
- public

检索前必须调用权限过滤。

项目对应实现：

- `KnowledgeBaseService.findAccessible()`
- `RetrievalService.search()`
- Qdrant filter by `knowledgeBaseId`

生活类比：

图书馆里有公共书架、部门书架、个人保险柜。搜索前先判断你能进哪个区域。

### 学习检查

你需要能回答：

1. 为什么 RAG 内容也可能不安全？
2. 为什么用户输入要被 wrap？
3. 为什么工具调用不能只靠模型自觉？
4. 知识库权限为什么要在检索前过滤？

---

## 第8章 第六阶段：Agent 系统

对应时间线：2026-06-25 Agent 集成设计。

### 要解决的问题

RAG 解决的是“查知识”，Function Calling 解决的是“调用单个工具”。但复杂任务需要多步骤推理：

```text
用户：帮我分析这份资料，并结合知识库总结风险
```

这类任务可能需要：

- 先判断是否需要工具。
- 检索知识库。
- 读取文件。
- 对比结果。
- 多轮调用工具。
- 最后总结。

这就是 Agent 要解决的问题。

### 需要掌握的知识点

#### 1. Agent 是什么

Agent 是具备“决策 + 工具调用 + 观察 + 再决策”能力的 AI 执行系统。

普通 Chat：

```text
用户 -> 模型 -> 回答
```

Agent：

```text
用户 -> 模型判断 -> 工具调用 -> 观察结果 -> 再判断 -> 最终回答
```

生活类比：

普通 Chat 像顾问，Agent 像助理。顾问只给建议，助理会查资料、调用系统、整理结果。

#### 2. ReAct 循环

ReAct = Reason + Act。

项目中的流程：

```text
agent_start
  -> agent_step
  -> 模型判断是否调用工具
  -> tool_call
  -> ToolRegistry.execute()
  -> tool_result
  -> 继续下一步
  -> agent_done
  -> 最终 streamChat
```

项目最大步数：

```text
MAX_AGENT_STEPS = 5
```

为什么要限制步数：

- 防止无限循环。
- 控制延迟和成本。
- 避免工具反复调用。

项目对应实现：

- `AgentOrchestratorService.streamWithAgent()`
- `AgentRouterService`
- `ToolRegistryService`

#### 3. Direct / Agent 路由

不是所有问题都要走 Agent。

direct 适合：

- 闲聊。
- 简单解释。
- 不需要工具的普通问答。

agent 适合：

- 查天气。
- 查知识库。
- 读文件（启用 MCP filesystem 后）。
- 多步骤分析。

项目对应实现：

- `AgentRouterService.route()`
- `AGENT_ROUTER_MODE`
- `ToolStage`

为什么需要路由：

Agent 更强，但更慢。简单问题走 direct，复杂问题走 agent，系统体验更平衡。

生活类比：

问“你好”不需要成立项目组；问“帮我调研并写报告”才需要安排助理执行。

#### 4. searchKnowledgeBase 工具

RAG 在项目里有两种形态：

1. 预检索：用户勾选知识库后，`RagStage` 自动检索并注入上下文。
2. Agent 工具检索：Agent 主动调用 `searchKnowledgeBase`。

当前实现细节：

- `searchKnowledgeBase` 工具复用 `RetrievalService.search()`。
- 工具返回结构是 `count` 和 `chunks`，每个 chunk 包含 `documentName`、`page`、`content`、`score`。
- 知识库检索预览 API 会返回 citations；Agent 工具返回的是给模型继续推理用的片段摘要，不等同于前端引用卡片结构。

为什么保留双轨：

- 预检索适合普通知识库问答，稳定、简单。
- 工具检索适合复杂任务，模型可以决定查什么关键词。

生活类比：

预检索像上课前老师先发讲义；Agent 工具检索像学生课堂上临时去图书馆查资料。

### 学习检查

你需要能回答：

1. Agent 和普通聊天的区别是什么？
2. ReAct 为什么要分多步？
3. 为什么要限制最大 Agent 步数？
4. RAG 预检索和 Agent 检索工具有什么区别？
5. 为什么 direct 和 agent 要路由？

---

## 第9章 第七阶段：Context Engine

对应时间线：2026-06-26 Context Engine 设计。

### 要解决的问题

随着系统能力变多，上下文来源也变多：

- system policy
- prompt template
- conversation summary
- recent messages
- current user message
- RAG chunks
- tool results
- memory

如果没有统一治理，上下文拼接会越来越混乱。

Context Engine 的目标是：把所有上下文先转换成统一的 ContextBlock，再做预算、裁剪、排序和拼接。

### 需要掌握的知识点

#### 1. ContextBlock

ContextBlock 是上下文的最小治理单元。

它包含：

- id
- type
- role
- content
- priority
- estimatedTokens
- source
- metadata

为什么需要统一 Block：

只有统一格式，系统才能比较不同上下文的重要性，才能做预算和裁剪。

生活类比：

准备会议资料时，所有材料先统一装进资料袋，并贴上类型、来源和重要程度标签。

#### 2. ContextPlan

ContextPlan 是本轮请求最终选中的上下文计划。

它回答几个问题：

- 这次请求最多能用多少 token？
- 哪些上下文被选中？
- 哪些上下文被丢弃？
- 为什么这么选？

项目对应实现：

- `ContextEngineService.buildPlan()`
- `ContextPlan`
- `ContextTraceService`

#### 3. Token Budget

模型上下文窗口有限。项目默认：

```text
maxTokens = 8192
reservedForResponse = 2048
availableForContext = 6144
```

为什么要预留 response：

如果输入上下文塞满，模型没有空间输出回答。

生活类比：

行李箱不能全部塞衣服，还要留空间放回程带的东西。

#### 4. Context Pruning

长对话需要裁剪。

优先保留：

- system / policy
- 当前用户消息
- prompt template
- summary
- 最近几轮消息
- 高分 RAG

优先丢弃：

- 旧消息
- 已被 summary 覆盖的内容
- 低优先级上下文
- 超长工具结果

项目对应实现：

- `ContextPruningService`
- `TokenBudgetManager`
- `ContextComposerService`

#### 5. PromptGuard 与上下文边界

`ContextComposerService` 对 message、rag、tool、memory 等用户载荷性质内容进行包裹，防止它们变成系统指令。

为什么需要：

RAG 文档和工具结果也可能包含恶意文本，不能让它们覆盖系统规则。

### 学习检查

你需要能回答：

1. 为什么不能简单把所有历史消息拼起来？
2. ContextBlock 的价值是什么？
3. Token budget 为什么比固定消息条数更合理？
4. RAG、Tool、Memory 为什么也要安全包裹？

---

## 第10章 第八阶段：AI Orchestrator

对应时间线：2026-06-26 AI Orchestrator 设计。

### 要解决的问题

当系统同时有 Prompt、RAG、Agent、Stream、安全、上下文预算时，如果所有逻辑都写在 Controller 里，会变成不可维护的上帝方法。

Orchestrator 的目标是建立单一调度入口。

### 需要掌握的知识点

#### 1. Pipeline 思维

项目最终采用六阶段 Pipeline：

```text
Input -> Context -> Prompt -> RAG -> Tool -> Stream
```

每个 Stage 只负责一类事情：

- InputStage：校验、落库、摘要、会话准备。
- ContextStage：构建基础 ContextPlan。
- PromptStage：注入 Prompt 模板。
- RagStage：检索知识库并注入 RAG blocks。
- ToolStage：拼接模型消息，判断 direct / agent。
- StreamStage：创建流会话并启动生成。

项目对应实现：

- `AiOrchestratorService`
- `PipelineContext`
- `PipelineInput`
- `stages/*.stage.ts`

#### 2. 为什么要拆 Stage

拆 Stage 的价值：

- 执行顺序清晰。
- 每一段可单测。
- 新功能可以插入新 Stage。
- Controller 变薄。
- RAG / Agent / Prompt 不再互相缠绕。

生活类比：

工厂流水线中，每个工位只做一件事。这样出了问题能定位，扩产时也能加工位。

#### 3. PipelineContext

Stage 之间通过 PipelineContext 传递数据。

它包含：

- sanitizedContent
- messageContent
- conversation
- messages
- summary
- contextPlan
- ragChunks
- ollamaMessages
- routeMode
- executionMode
- agentContext
- streamId

为什么需要统一上下文对象：

如果每个 Stage 直接调用其他 Stage 或共享全局变量，系统会变得难以测试和扩展。

### 学习检查

你需要能回答：

1. 为什么 Controller 不应该负责全部 AI 编排？
2. Pipeline 比散落调用好在哪里？
3. 每个 Stage 的职责是什么？
4. 如果要新增“审计 Stage”，应该插在哪里？

---

# 第三部分：核心链路拆解

## 第11章 文档入库链路

完整链路：

```text
上传文件
  -> 校验权限和文件类型
  -> 创建 Document(status=pending)
  -> 设置 processing
  -> parser.parse()
  -> ChunkService.split()
  -> EmbeddingService.embedTexts()
  -> Prisma 写 Chunk
  -> Qdrant upsert vector + payload
  -> Document(status=ready)
```

必须掌握：

- 文件上传安全。
- 文档状态机。
- 分块策略。
- 向量化。
- MySQL 与 Qdrant 双写。
- 失败回滚与错误提示。

关键文件：

- `knowledge-base/ingest.service.ts`
- `knowledge-base/chunk.service.ts`
- `embedding/embedding.service.ts`
- `vector/qdrant.service.ts`

面试讲法：

> 文档入库是离线 RAG pipeline。系统不会在用户提问时临时解析整份文档，而是在上传时完成解析、分块、向量化和索引，查询时只做快速召回。

---

## 第12章 用户提问链路

完整链路：

```text
前端发送 SSE 请求
  -> ConversationController
  -> AiOrchestratorService.run()
  -> InputStage
  -> ContextStage
  -> PromptStage
  -> RagStage
  -> ToolStage
  -> StreamStage
  -> ConversationStreamService
  -> AiService / AgentOrchestrator
  -> Ollama
  -> SSE 返回
```

必须掌握：

- 为什么请求要先落库。
- 为什么上下文要先规划再拼接。
- 为什么 RAG 在模型调用前完成。
- 为什么 ToolStage 要决定 direct / agent。
- 为什么 StreamStage 要和 SSE 观察分离。

面试讲法：

> 用户提问不是直接打到模型，而是先经过统一编排器。编排器将输入、上下文、Prompt、RAG、Agent 路由和流式输出拆成六个 Stage，保证 AI 链路可维护、可扩展、可测试。

---

## 第13章 Agent 执行链路

完整链路：

```text
ToolStage 判断 executionMode = agent
  -> ConversationStreamService.resolveStreamObservable()
  -> AgentOrchestratorService.streamWithAgent()
  -> 注入 ToolPrompt
  -> LLM 非流式判断工具
  -> ToolCallParser 解析 JSON
  -> ToolRegistry 执行工具
  -> 返回观察结果
  -> 最多循环 5 步
  -> 最终 streamChat 输出自然语言
```

必须掌握：

- Tool Prompt 如何告诉模型可用工具。
- Parser 如何从模型输出中提取 JSON。
- Registry 如何执行工具。
- Agent 为什么要发 SSE 阶段事件。
- 最终回答为什么要使用干净上下文。

面试讲法：

> Agent 使用 ReAct 循环：每一步先让模型判断是否需要工具，如果需要就执行工具并把观察结果追加回上下文；如果不需要工具，或者达到最大步数，就进入最终流式回答。

---

# 第四部分：从零实现路线

## 第14章 最小可用 AI Chat

先实现：

- 用户表和登录。
- Conversation / Message 表。
- NestJS Controller。
- Ollama chat 调用。
- SSE 流式返回。
- 前端 EventSource 消费。

验收标准：

- 用户能发送消息。
- AI 能流式回复。
- 历史消息可查看。
- 刷新页面不丢消息。

不要一开始做：

- RAG
- Agent
- MCP filesystem 示例
- Memory
- 复杂 Prompt 模板

原因：

基础聊天链路是所有后续能力的地基。

---

## 第15章 加入 Prompt 模板

再实现：

- prompts JSON 目录。
- PromptTemplateService。
- 获取模板列表 API。
- 首条消息绑定 promptId。
- system prompt 注入。
- 前端模板选择器。

验收标准：

- 不同模板能改变 AI 行为。
- 多轮对话保持模板角色。
- 模板文件可新增。

---

## 第16章 加入 Function Calling

再实现：

- ToolDefinition 类型。
- ToolRegistry。
- ToolPromptService。
- ToolCallParser。
- 第一个 weather 工具。
- 工具调用 SSE 事件。
- 前端工具卡片。

验收标准：

- 用户问天气且路由进入工具/Agent 路径时能触发 `weather` 工具。
- 工具结果能进入最终回答。
- 普通问题不触发工具。

---

## 第17章 加入 RAG

再实现：

- KnowledgeBase / Document / Chunk 数据模型。
- 文件上传。
- 文档解析。
- ChunkService。
- EmbeddingService。
- QdrantService。
- RetrievalService。
- CitationBlock 或 message-ast citation block。

验收标准：

- 上传文档后能生成 Chunk。
- Qdrant 有对应向量。
- 提问时能召回相关片段。
- 知识库检索预览能展示引用；聊天回答引用展示需要确保后端把 citations 事件化或结构化返回。

---

## 第18章 加入 Agent

再实现：

- AgentRouterService。
- AgentOrchestratorService。
- MAX_AGENT_STEPS。
- searchKnowledgeBase 工具。
- agent_start / agent_step / agent_done SSE 事件。
- 前端 Agent 时间线。

验收标准：

- 简单问题走 direct。
- 复杂问题走 agent。
- Agent 能主动调用知识库工具。
- 多步执行过程前端可见。

---

## 第19章 加入 Context Engine

再实现：

- ContextBlock。
- ContextPlan。
- TokenBudgetManager。
- ContextPruningService。
- ContextComposerService。
- ContextTraceService。
- Memory 可后置。

验收标准：

- 每次模型调用前都有 ContextPlan。
- 超长历史能被裁剪。
- summary / rag / prompt / message 有优先级。
- trace 能解释上下文选择。

---

## 第20章 加入 Orchestrator

最后重构为：

```text
InputStage
ContextStage
PromptStage
RagStage
ToolStage
StreamStage
```

验收标准：

- Controller 只负责 HTTP 和鉴权。
- AI 链路统一从 Orchestrator 进入。
- 每个 Stage 职责清晰。
- 后续可以插入新 Stage。

---

# 第五部分：必须掌握的知识点清单

## 后端工程

- NestJS Module、Controller、Service、DI。
- DTO、ValidationPipe、Exception。
- SSE Observable。
- Prisma schema、relation、transaction。
- MySQL 索引与查询优化。
- Redis session、快照、断线续传。
- 文件上传与 MIME 校验。
- Docker Compose。

## AI 工程

- Chat messages 格式。
- system / user / assistant role。
- stream vs non-stream。
- Prompt 模板。
- Function Calling。
- Tool Registry。
- ReAct Agent。
- Token budget。
- Context pruning。
- Prompt injection 防护。

## RAG

- 文档解析。
- Chunking。
- Overlap。
- Embedding。
- Vector database。
- Cosine similarity。
- Top-K。
- Hybrid search。
- Rerank 思路。
- Citation。
- 权限过滤。

## Agent

- Direct / Agent 路由。
- Tool Prompt。
- JSON tool call parser。
- Tool execution。
- Observation。
- Multi-step loop。
- Max steps。
- MCP 基础概念。
- Agent timeline UI。

## 前端

- EventSource。
- 流式消息拼接。
- loading / done / error 状态。
- 工具调用卡片。
- 引用卡片。
- Agent 步骤时间线。
- 知识库选择器。
- Markdown 安全渲染。

---

# 第六部分：面试表达模板

## 1. 一句话介绍项目

这是一个基于 NestJS 和 Next.js 的企业级 AI RAG Agent 系统，支持本地 Ollama 模型、Prompt 模板、知识库 RAG、向量检索、Function Calling、多步 Agent、SSE 流式输出和上下文治理。

## 2. 架构表达

系统采用统一 Orchestrator 编排 AI 请求，将一次聊天请求拆成 Input、Context、Prompt、RAG、Tool、Stream 六个阶段。这样可以把输入校验、上下文规划、Prompt 注入、知识检索、Agent 路由和流式输出解耦，避免 Controller 变成上帝模块。

## 3. RAG 表达

RAG 分为离线入库和在线检索。离线入库时，文档经过解析、分块、Embedding 后写入 MySQL 和 Qdrant；在线检索时，用户问题先向量化，再通过 Qdrant 做语义召回，同时结合 MySQL 关键词检索做混合排序，最终把 Top-K Chunk 注入上下文。知识库检索预览接口会返回 citations；聊天链路若要稳定展示引用，需要继续把 citations 随 SSE 或结构化消息传给前端。

## 4. Agent 表达

Agent 使用 ReAct 思路。系统先通过 AgentRouter 判断 direct 或 agent。进入 agent 后，模型根据 ToolPrompt 输出工具 JSON，后端解析并执行工具，再把工具结果作为观察返回给模型，最多循环 5 步，最后使用干净上下文流式生成自然语言回答。

## 5. Context Engine 表达

Context Engine 把 system policy、Prompt、summary、history、RAG、tool result、memory 等不同来源统一抽象成 ContextBlock，再根据优先级和 token budget 生成 ContextPlan。这样可以解决长对话、上下文超限、安全隔离和可解释性问题。

## 6. 安全表达

系统通过 PromptGuard 区分指令和数据，对用户输入、RAG 内容、工具结果进行边界包裹；工具调用只允许 knownTools；知识库检索前先做权限过滤，并通过 Qdrant payload filter 限制可见范围。

---

# 第七部分：优化方向

## 1. 检索准确率

可以优化：

- Chunk size 和 overlap。
- 关键词提取规则。
- hybrid score 权重。
- RAG_SCORE_THRESHOLD。
- 引入 reranker（优化方向，当前主链路未实现独立 rerank 阶段）。
- 增加文档 metadata 过滤。

## 2. 幻觉控制

可以优化：

- Prompt 中要求基于检索资料回答。
- 无资料时明确说不知道。
- 检索预览必须展示出处；聊天回答建议补齐 citations 事件化展示。
- 对 RAG 片段做相关性阈值过滤。
- 最终回答前做事实一致性校验。

## 3. 响应速度

可以优化：

- embedding 批处理。
- 检索结果缓存。
- 常见 query 缓存。
- Agent 路由规则前置。
- 减少不必要的 Agent 步数。
- 流式输出首 token 延迟优化。

## 4. 工程稳定性

可以优化：

- 文档入库改为异步队列。
- 工具调用持久化。
- Agent step 落库（优化方向）。
- Context trace 可视化（优化方向）。
- RAG 命中率监控。
- SSE Event Bus 抽象（已有设计文档，当前代码未见独立 event bus 模块）。

---

# 第八部分：完整知识地图

```text
AI RAG Agent 系统
├─ 基础 AI Chat
│  ├─ NestJS Controller
│  ├─ Conversation / Message
│  ├─ Ollama Chat
│  ├─ SSE Streaming
│  └─ 前端流式渲染
├─ Prompt 工程
│  ├─ Role
│  ├─ Task
│  ├─ Context
│  ├─ Constraint
│  ├─ Output Format
│  ├─ Prompt JSON 模板
│  └─ System Prompt 注入
├─ Function Calling
│  ├─ Tool Prompt
│  ├─ Tool JSON 协议
│  ├─ ToolCallParser
│  ├─ ToolRegistry
│  ├─ Tool Execution
│  └─ Tool Result 回注
├─ RAG
│  ├─ 文档上传
│  ├─ 文档解析
│  ├─ Chunking
│  ├─ Embedding
│  ├─ Qdrant
│  ├─ Vector Search
│  ├─ Keyword Search
│  ├─ Hybrid Ranking
│  ├─ Context 注入
│  └─ Citation
├─ Agent
│  ├─ Direct / Agent Router
│  ├─ ReAct Loop
│  ├─ Multi-step Reasoning
│  ├─ searchKnowledgeBase Tool
│  ├─ MCP filesystem Tool Bridge
│  ├─ Agent SSE Events
│  └─ Agent Timeline UI
├─ Context Engine
│  ├─ ContextBlock
│  ├─ ContextPlan
│  ├─ TokenBudgetManager
│  ├─ ContextPruning
│  ├─ ContextComposer
│  ├─ ContextTrace
│  └─ Memory
├─ Orchestrator
│  ├─ InputStage
│  ├─ ContextStage
│  ├─ PromptStage
│  ├─ RagStage
│  ├─ ToolStage
│  └─ StreamStage
├─ 安全体系
│  ├─ Prompt Injection 防护
│  ├─ Tool Injection 防护
│  ├─ RAG 内容隔离
│  ├─ Markdown 安全
│  ├─ 内容审核
│  └─ 知识库权限
└─ 工程优化
   ├─ 检索准确率
   ├─ 幻觉控制
   ├─ 响应速度
   ├─ 可观测性
   ├─ 异步队列
   └─ 企业级扩展
```

---

# 第九部分：推荐学习节奏

## 第1周：跑通基础聊天

目标：

- 理解 NestJS + Ollama + SSE。
- 能讲清楚 Conversation / Message。
- 能改一个简单 Prompt。

产出：

- 画出基础聊天链路图。
- 手写一个最小 SSE demo。

## 第2周：Prompt 和工具调用

目标：

- 理解 Prompt 模板。
- 理解 Tool Calling。
- 能新增一个简单工具。

产出：

- 新增一个 `calculator` 或 `time` 工具。
- 能解释两轮调用。

## 第3周：RAG

目标：

- 理解文档入库 pipeline。
- 理解 Chunk、Embedding、Qdrant。
- 能调检索参数。

产出：

- 上传一份文档并完成问答。
- 能解释为什么召回某几个 Chunk。

## 第4周：Agent

目标：

- 理解 ReAct。
- 理解 direct / agent 路由。
- 理解工具观察结果如何回注。

产出：

- 让 Agent 主动调用知识库工具。
- 前端展示 Agent 时间线。

## 第5周：Context Engine 和 Orchestrator

目标：

- 理解 ContextPlan。
- 理解 token budget。
- 理解六阶段 Pipeline。

产出：

- 能从用户输入开始，完整讲到最终 SSE 输出。
- 能指出每个模块的职责边界。

---

# 第十部分：最终复盘问题

学完这个项目后，你应该能回答：

1. AI 应用系统和简单大模型调用有什么区别？
2. 为什么企业 AI 系统通常需要 RAG？
3. RAG 为什么要先分块再向量化？
4. 为什么需要向量数据库？
5. 为什么还要做关键词混合检索？
6. Prompt 模板为什么要后端管理？
7. Function Calling 的本质是什么？
8. Agent 和 Function Calling 的区别是什么？
9. ReAct 循环如何防止无限执行？
10. Context Engine 为什么比简单拼接 messages 更合理？
11. Orchestrator 为什么要拆成 Stage？
12. Prompt Injection 在这个项目里如何防？
13. RAG 引用如何降低幻觉？
14. 如果要提升检索准确率，你会从哪里下手？
15. 如果要从零实现这个系统，你会按什么顺序做？

---

# 第十一部分：前端转 AI 应用开发定位

## 第1章 你不是转算法，而是转 AI 应用工程

前端开发转 AI 应用开发，重点不是去和算法工程师比模型训练、微调、论文和底层推理优化，而是把大模型能力做成真实可用的产品。

你要强调的定位是：

```text
我不是做大模型底层训练的人，
我是把 LLM、RAG、Agent、工具调用和业务系统结合起来，
做成用户真正能用的 AI 应用的人。
```

这个定位非常适合前端开发转型，因为 AI 应用最终一定要落到产品交互、业务流程、数据权限、工程稳定性和用户体验上。

### 前端经验可以迁移到哪里

| 前端原能力 | AI 应用中的对应价值 |
|-----------|--------------------|
| 组件化 | ChatMessage、ToolCallBlock、AgentStepBlock、CitationBlock / message-ast 引用块 |
| 状态管理 | 流式消息、生成中状态、取消、重试、断线恢复 |
| 异步请求 | SSE、EventSource、流式增量拼接 |
| 用户体验 | 打字机效果、思考过程展示、检索预览引用展示、工具过程可视化 |
| 工程化 | 模块拆分、类型约束、错误处理、可维护性 |
| 权限意识 | 知识库可见性、用户会话隔离、前后端鉴权 |
| 性能优化 | 首 token 延迟、长列表渲染、Markdown 渲染性能 |
| 安全意识 | Markdown XSS、Prompt Injection 前端预检、链接白名单 |

### 你需要补齐什么

前端转 AI 应用开发，最需要补齐的是这几类知识：

1. LLM 调用链路：messages、system/user/assistant、stream、token。
2. Prompt 工程：Role、Task、Context、Constraint、Output。
3. RAG：文档解析、分块、Embedding、向量库、检索、引用。
4. Agent：工具调用、ReAct、多步骤推理、工具结果回注。
5. 后端编排：Controller 不直接堆逻辑，使用 Orchestrator / Stage / Context Engine。
6. AI 安全：Prompt Injection、Tool Injection、RAG Injection、权限过滤。

### 面试中不要怎么说

不要说：

```text
我想转 AI，所以学了一些大模型。
```

这句话太泛，不像能落地。

更好的说法：

```text
我原来做前端，优势是交互和工程化。现在我补齐了 AI 应用开发链路，包括 Prompt 模板、RAG 知识库、向量检索、Agent 工具调用和 SSE 流式体验。我的方向不是模型训练，而是把大模型能力产品化、工程化、业务化。
```

生活类比：

算法工程师像造发动机的人，AI 应用工程师像造汽车的人。你不一定制造发动机，但你要知道发动机怎么接入、怎么控制、怎么让用户安全稳定地驾驶。

---

## 第2章 AI 前端岗位关注什么

AI 前端不是普通后台页面开发，也不是简单调接口展示文本。它重点关注“AI 生成过程如何被用户理解和控制”。

### AI 前端核心能力

你需要掌握：

- 流式对话 UI。
- SSE / WebSocket 选型。
- Markdown 渲染与安全。
- thinking / response 分区展示。
- 取消生成、重新生成、继续生成。
- Tool Calling 过程展示。
- Agent 多步骤时间线。
- RAG 引用卡片（当前主要用于知识库检索预览；聊天引用展示可继续完善）。
- 知识库选择器。
- Prompt 模板选择器。
- 错误、超时、断线续传。

### 当前项目对应亮点

| AI 前端能力 | 项目对应实现 |
|------------|-------------|
| 流式响应 | `AIClient.ts`、`StreamAdapter.ts` |
| 聊天页面 | `admin-web/app/chat/page.tsx` |
| 工具调用展示 | `ToolCallBlock.tsx` |
| Agent 步骤展示 | `AgentStepBlock.tsx` |
| RAG 引用展示 | `CitationBlock.tsx` 用于知识库检索预览；`message-ast` 具备 citation block 渲染能力 |
| 知识库选择 | `KnowledgeBasePicker.tsx` |
| Prompt 模板交互 | PromptTemplatePicker 相关能力 |
| Markdown 安全 | message AST security |

### 面试官可能追问

#### 问题：AI 流式输出前端怎么做？

推荐回答：

```text
我会用 SSE 或 WebSocket 接收服务端增量事件。这个项目里用 SSE，因为 AI 生成主要是服务端向客户端单向推送，EventSource 原生支持重连，复杂度比 WebSocket 低。

前端收到 thinkingDelta、contentDelta、tool_call、tool_result、done 等事件后，不是每次都重新拉全量消息，而是维护当前 assistant 临时消息，把增量拼接到 thinking 或 content 字段中。done 后再把最终消息固化到列表。
```

#### 问题：SSE 和 WebSocket 怎么选？

推荐回答：

```text
如果只是 AI token 流式输出，SSE 更合适，因为它是服务端到客户端的单向流，协议简单，浏览器原生支持 EventSource。

如果业务需要强双向实时交互，比如多人协作、实时语音、客户端频繁发送控制指令，则 WebSocket 更合适。

这个项目的聊天生成是典型服务端单向推送，所以选择 SSE。
```

#### 问题：AI 回复为什么要区分 thinking 和 response？

推荐回答：

```text
有些本地模型会输出思考内容和最终回答。前端分开展示可以提升可解释性，但也要注意产品策略：思考过程可以折叠展示，最终回答必须清晰突出，不能让用户被中间推理干扰。
```

#### 问题：RAG 引用前端怎么展示？

推荐回答：

```text
我会把引用当成独立结构展示，而不是混在回答文本里。每条引用包含文档名、页码、片段摘要和相似度分数。当前项目在知识库检索预览页已经通过 `CitationBlock` 展示 citations，聊天消息侧也有 message-ast 的 citation block 类型；如果要做到每次聊天回答都稳定带引用，还需要让后端把 RAG citations 作为 SSE 事件或结构化消息字段返回。
```

#### 问题：Agent 步骤为什么要可视化？

推荐回答：

```text
Agent 可能会经历多步工具调用，如果前端只显示最终答案，用户不知道系统是否卡住，也不知道它查了什么。展示 agent_start、agent_step、tool_call、tool_result、agent_done 可以让用户看到执行过程，提高可控感和信任感。
```

生活类比：

普通搜索像直接给结果，AI Agent 像帮你办事。用户不只想要结果，也想知道“它现在办到哪一步了”。

---

## 第3章 AI 应用开发岗位关注什么

AI 应用开发更关注系统链路和工程落地，不只看前端 UI。

你需要能讲清楚：

- 一次用户问题如何进入模型。
- Prompt 如何组织。
- RAG 如何检索。
- Agent 如何调用工具。
- 上下文如何裁剪。
- 如何降低幻觉。
- 如何做权限和安全。
- 如何优化速度和准确率。

### AI 应用开发能力模型

```text
AI 应用开发能力
├─ LLM API 调用
│  ├─ messages
│  ├─ stream
│  ├─ token
│  └─ cache
├─ Prompt 工程
│  ├─ 模板化
│  ├─ system/user/context 分层
│  └─ 输出格式约束
├─ RAG
│  ├─ 文档入库
│  ├─ chunking
│  ├─ embedding
│  ├─ vector search
│  ├─ hybrid search
│  └─ citation
├─ Agent
│  ├─ route
│  ├─ tool prompt
│  ├─ parser
│  ├─ registry
│  └─ ReAct loop
├─ Context
│  ├─ ContextBlock
│  ├─ token budget
│  ├─ pruning
│  └─ trace
└─ 安全和工程化
   ├─ prompt injection
   ├─ permission
   ├─ SSE resume
   ├─ error handling
   └─ observability
```

### 面试官最常深挖的点

#### 1. 为什么不能只把文档塞进 Prompt？

推荐回答：

```text
因为模型上下文窗口有限，企业文档通常很大，全部塞进去会超 token、成本高、速度慢，而且相关性差。

RAG 的思路是先离线把文档解析、分块、向量化，用户提问时只检索最相关的片段放进上下文。这样既节省 token，也能提升答案相关性。
```

#### 2. Chunk 大小怎么设计？

推荐回答：

```text
Chunk 太小会丢语义，模型拿到片段后不知道上下文；Chunk 太大又会带入太多无关内容，浪费 token，降低检索精度。

这个项目默认 800 字符，overlap 120。策略是先按标题和段落切，再合并短段落，超长段落按句子切，最后回退滑动窗口。这种方式兼顾语义完整性和检索粒度。
```

#### 3. 为什么要混合检索？

推荐回答：

```text
纯向量检索能理解语义，但可能召回语义相近却关键词不匹配的内容。纯关键词检索精确，但不理解同义表达。

所以项目里同时做 Qdrant 向量召回和 MySQL 关键词召回，再合并分数。向量和关键词双命中的片段会加分，能提高准确率并减少误召回。
```

#### 4. Function Calling 和 Agent 有什么区别？

推荐回答：

```text
Function Calling 更像一次工具调用：模型判断需要哪个工具，后端执行，模型再生成回答。

Agent 是多步骤循环：模型可以多次判断、调用工具、观察结果、继续推理，直到得到足够信息再回答。

这个项目早期有单轮 ToolOrchestrator，后面升级为 AgentOrchestrator，支持最多 5 步 ReAct。
```

#### 5. Context Engine 解决什么问题？

推荐回答：

```text
随着系统有 Prompt、历史消息、摘要、RAG、工具结果、Memory，如果直接拼 messages，会很快失控。

Context Engine 把所有来源统一成 ContextBlock，再根据优先级和 token budget 生成 ContextPlan。这样能控制上下文长度，也能解释为什么本轮选择了这些内容、丢弃了哪些内容。
```

#### 6. 如何减少幻觉？

推荐回答：

```text
我会从三层控制：

第一是检索层，提高召回质量，设置相似度阈值，使用混合检索；rerank 可以作为后续优化。

第二是 Prompt 层，要求模型基于检索资料回答，资料不足时明确说不知道。

第三是展示层，前端展示 citation，让用户能追溯来源。

这个项目里已经有 RAG_TOP_K、RAG_SCORE_THRESHOLD、知识库检索预览 CitationBlock 和 PromptGuard 这些基础能力；聊天回答引用的事件化展示还可以继续补齐。
```

---

# 第十二部分：项目包装与面试话术

## 第1章 1 分钟项目介绍

面试开场可以这样说：

```text
我做的是一个 Prompt RAG Agent 系统，定位是企业级 AI 应用平台。

它不是简单调用大模型接口，而是包含完整的 AI 应用链路：前端支持 SSE 流式对话、Prompt 模板选择、知识库选择、知识库检索预览引用、工具调用和 Agent 步骤展示；后端基于 NestJS 做统一 AI Orchestrator，把一次用户请求拆成 Input、Context、Prompt、RAG、Tool、Stream 六个阶段。

系统支持文档上传后解析、分块、Embedding、写入 Qdrant，用户提问时做向量和关键词混合检索，再把相关片段注入上下文。复杂问题会进入 Agent 模式，通过 ReAct 循环调用工具，比如搜索知识库；MCP 当前接入的是 filesystem 示例，启用后可把文件系统工具注册进 Agent。

我在这个项目里重点学习和实践的是 AI 应用工程化：Prompt、RAG、Agent、上下文治理、流式体验和安全权限。
```

## 第2章 3 分钟架构介绍

```text
从架构上看，系统分为前端交互层、后端编排层、上下文层、RAG 层、Agent 工具层和模型层。

前端交互层负责 AI 产品体验，包括聊天列表、流式消息、知识库选择、检索预览引用展示、工具调用卡片和 Agent 时间线。这里的重点不是简单展示文本，而是把 AI 生成过程拆成用户能理解的状态。

后端编排层由 AiOrchestratorService 负责，它把请求拆成六个 Stage：Input 处理校验和落库，Context 构建基础上下文计划，Prompt 注入模板，RAG 检索知识库，Tool 判断 direct 或 agent，Stream 启动流式生成。

RAG 层分为离线入库和在线检索。离线入库时，文档会被解析、分块、向量化，原文写 MySQL，向量写 Qdrant。在线检索时，系统对用户问题做 embedding，同时做向量召回和关键词召回，再融合分数得到 Top-K Chunk。

Agent 层使用 ReAct 思路。简单问题 direct 回答，复杂问题进入 AgentOrchestrator。模型先根据 ToolPrompt 判断是否调用工具，后端解析 JSON 并执行工具，再把结果作为观察返回模型，最多执行 5 步，最后生成自然语言回答。

Context Engine 负责上下文治理，把 system policy、Prompt、summary、history、RAG、tool result、memory 都转成 ContextBlock，再做 token budget 和 pruning，避免上下文无限增长。
```

## 第3章 前端亮点表达

可以这样说：

```text
这个项目的前端亮点主要是 AI 交互工程化。

第一，流式消息不是普通请求响应，而是通过 SSE 接收 thinkingDelta、contentDelta、tool_call、tool_result、agent_step 等事件，前端根据事件类型增量更新 UI。

第二，AI 过程可视化。知识库检索预览的引用用 CitationBlock 展示，工具调用用 ToolCallBlock 展示，Agent 多步骤推理用 AgentStepBlock 展示，用户可以知道 AI 查了什么、调用了什么、当前执行到哪一步。

第三，体验控制。聊天中需要支持生成中状态、取消生成、重新生成、错误恢复、断线续传和 Markdown 安全渲染，这些都是 AI 产品和普通 CRUD 后台的区别。
```

## 第4章 后端亮点表达

可以这样说：

```text
后端亮点是把 AI 调用做成可维护的工程链路。

我没有把所有逻辑写在 Controller 里，而是用 AiOrchestratorService 做统一入口，再拆成 Input、Context、Prompt、RAG、Tool、Stream 六个阶段。

RAG 检索也不是简单查库，而是文档入库时先解析、分块、向量化，查询时做 Qdrant 向量召回和 MySQL 关键词召回，再做混合排序。

Agent 也不是一次工具调用，而是多步 ReAct 循环，支持工具调用、结果观察和最终回答分离。

同时 Context Engine 负责 token budget 和上下文裁剪，PromptGuard 负责输入隔离和工具安全，知识库检索前会做权限过滤。
```

## 第5章 项目难点表达

可以选择 3 个难点讲：

### 难点 1：流式输出和状态同步

```text
AI 输出不是一次性返回，而是持续增量返回。前端要处理 contentDelta、thinkingDelta、工具事件和 done 事件，还要保证用户刷新或断线后能恢复。

项目通过 ConversationStreamService 把后台生成和 SSE 连接解耦，用 Redis 快照保存进度，前端按事件增量更新当前 assistant 消息。
```

### 难点 2：RAG 检索准确率

```text
RAG 的难点不是能不能搜到，而是能不能搜准。项目通过 Chunk 策略保证语义完整，通过向量检索理解语义，通过关键词检索保证精确词命中，再用混合分数排序和阈值过滤降低误召回。
```

### 难点 3：上下文治理

```text
AI 系统上下文来源很多，如果简单拼接，很容易超 token 或注入无关信息。项目引入 ContextEngine，把不同来源统一成 ContextBlock，再按优先级和 token budget 生成 ContextPlan。
```

---

# 第十三部分：高频面试题与参考答案

## AI 前端方向

### 1. AI 聊天为什么要流式输出？

因为大模型生成耗时较长，如果等完整回答返回，用户会感觉系统卡住。流式输出能降低感知等待时间，让用户尽早看到内容，也方便展示思考过程、工具调用过程和中间状态。

### 2. 前端如何处理流式 Markdown？

流式 Markdown 不能假设每次都是完整语法。前端通常维护当前消息文本，每次增量追加后重新渲染或局部渲染。要注意代码块未闭合、表格未完成、列表未完成等情况。同时必须做安全处理，只允许安全协议链接，避免 `javascript:` 这类危险内容。

### 3. 取消生成怎么做？

前端发起取消请求，后端根据 streamId 找到当前生成任务，unsubscribe 模型流或标记 cancelled。已经生成的内容可以保留为 interrupted 状态，避免用户体验上完全丢失。

### 4. 重新生成怎么做？

重新生成通常删除或忽略上一条 assistant 消息，保留用户消息，重新走 AI pipeline。要注意不要重复创建用户消息，也要区分 regenerate 和普通新消息。

### 5. AI 前端和普通后台前端有什么区别？

普通后台主要是确定性 CRUD，AI 前端面对的是不确定、流式、多阶段的生成过程。它需要处理 token 增量、工具状态、引用、思考过程、取消、重试、错误恢复和安全渲染。

## AI 应用开发方向

### 1. 什么是 RAG？

RAG 是检索增强生成。系统先从外部知识库检索与用户问题相关的内容，再把这些内容作为上下文交给大模型生成回答。它解决的是模型不知道私有知识、知识过期和幻觉的问题。

### 2. Embedding 是什么？

Embedding 是把文本转换成向量。语义相似的文本在向量空间里距离更近。RAG 通过把文档 Chunk 和用户问题都向量化，再计算相似度来找到相关资料。

### 3. 向量数据库有什么用？

向量数据库用于高效存储和检索向量。普通数据库适合精确查询，向量数据库适合语义相似度搜索。项目里用 Qdrant 存储 Chunk 向量，并通过 payload 记录业务字段。

### 4. Agent 是什么？

Agent 是能根据任务自主决定是否调用工具、观察工具结果并继续推理的系统。它不是单次大模型回答，而是一个多步骤执行循环。

### 5. MCP 是什么？

MCP 是 Model Context Protocol，用来把外部工具和数据源以统一协议暴露给 AI Agent。当前项目接入的是 filesystem MCP 示例；数据库、CRM、ERP 等企业系统属于同类协议的扩展方向，不能说成本项目已经完成。

### 6. 如何评估 RAG 效果？

可以从几个指标看：

- 召回是否命中正确文档。
- Top-K 片段是否相关。
- 答案是否基于引用。
- 无答案时是否能拒答。
- 用户是否能通过 citation 验证来源。

### 7. 如何优化首 token 延迟？

可以从几方面优化：

- 减少路由阶段不必要的 LLM 调用。
- 缓存 prompt 模板和常见检索结果。
- embedding 并发或缓存。
- RAG Top-K 不要过大。
- direct 问题不进入 Agent。
- 后端尽早建立 SSE 连接并发送状态事件。

### 8. 如何防止 Prompt Injection？

核心是区分系统指令和外部数据。用户输入、RAG 文档、工具结果都要包裹边界，告诉模型这些是数据不是指令。工具调用必须走白名单和参数净化，不能让用户伪造 JSON 直接执行工具。

### 9. 为什么需要 Orchestrator？

AI 请求链路包含输入校验、上下文构建、Prompt 注入、RAG 检索、Agent 路由、流式输出。如果这些逻辑都写在 Controller 里会非常混乱。Orchestrator 把它拆成固定 Pipeline，让系统可维护、可扩展、可测试。

### 10. 你作为前端转 AI 应用开发，优势是什么？

推荐回答：

```text
我的优势是能把 AI 能力做成真正可用的产品体验。我理解前端交互、状态管理、流式 UI、组件化和工程化，也补齐了 AI 应用后端链路，包括 Prompt、RAG、Agent、向量检索和上下文治理。

相比只会调 API，我更关注 AI 应用的完整闭环：用户输入怎么进入模型，知识怎么检索，工具怎么调用，过程怎么展示，错误怎么处理，结果怎么让用户信任。
```

---

# 第十四部分：30 天面试冲刺路线

## 第1周：AI 前端体验专项

目标：

- 能手写 SSE 流式消息逻辑。
- 能讲清楚 EventSource 和 WebSocket 区别。
- 能实现 ChatMessage、ToolCallBlock、AgentStepBlock 的交互，并能讲清 CitationBlock 当前在知识库检索预览中的使用方式。
- 能处理取消生成、重新生成、错误状态。

每天重点：

1. 第 1 天：复习 `AIClient.ts` 和 `StreamAdapter.ts`。
2. 第 2 天：整理 SSE 事件协议。
3. 第 3 天：复习聊天页面状态管理。
4. 第 4 天：整理 Markdown 安全渲染。
5. 第 5 天：复习 ToolCallBlock 和 AgentStepBlock。
6. 第 6 天：模拟讲解 AI 前端亮点。
7. 第 7 天：手写一个最小流式聊天 demo。

## 第2周：RAG 专项

目标：

- 能从零讲清楚文档入库和检索链路。
- 能解释 Chunk、Embedding、Qdrant、Top-K、Hybrid Search。
- 能回答如何提升检索准确率。

每天重点：

1. 第 8 天：复习 `IngestService`。
2. 第 9 天：复习 `ChunkService`。
3. 第 10 天：复习 `EmbeddingService` 和 `QdrantService`。
4. 第 11 天：复习 `RetrievalService`。
5. 第 12 天：整理 RAG 面试题。
6. 第 13 天：画 RAG 入库和检索链路图。
7. 第 14 天：用 3 分钟讲 RAG。

## 第3周：Agent 和 Context 专项

目标：

- 能讲清楚 Function Calling 和 Agent 的区别。
- 能讲清楚 ReAct 循环。
- 能讲清楚 Context Engine 的作用。

每天重点：

1. 第 15 天：复习 `ToolPromptService`。
2. 第 16 天：复习 `ToolCallParserService`。
3. 第 17 天：复习 `ToolRegistryService`。
4. 第 18 天：复习 `AgentRouterService`。
5. 第 19 天：复习 `AgentOrchestratorService`。
6. 第 20 天：复习 `ContextEngineService`。
7. 第 21 天：整理 Agent 和 Context 高频题。

## 第4周：项目包装和模拟面试

目标：

- 能讲 1 分钟项目介绍。
- 能讲 3 分钟架构。
- 能应对 RAG、Agent、前端体验、安全、优化追问。

每天重点：

1. 第 22 天：背熟 1 分钟项目介绍。
2. 第 23 天：背熟 3 分钟架构介绍。
3. 第 24 天：准备 AI 前端问答。
4. 第 25 天：准备 AI 应用开发问答。
5. 第 26 天：准备项目难点和优化方向。
6. 第 27 天：模拟一轮技术面。
7. 第 28 天：整理简历项目描述。
8. 第 29 天：复盘薄弱点。
9. 第 30 天：完整模拟面试。

---

# 第十五部分：简历项目描述参考

## 简历版本 1：AI 前端方向

```text
Prompt RAG Agent 企业 AI 应用平台

- 基于 Next.js 实现 AI Chat 交互，支持 SSE 流式输出、思考过程展示、取消生成、重新生成和异常状态处理。
- 设计并实现 AI 过程可视化组件，包括知识库检索引用卡片、工具调用卡片、Agent 执行步骤时间线，提升用户对 AI 生成过程的可解释性。
- 接入 Prompt 模板和知识库选择能力，支持用户在聊天前选择业务场景和知识库范围。
- 处理流式 Markdown 渲染和安全链接过滤，降低 AI 输出内容带来的前端安全风险。
```

## 简历版本 2：AI 应用开发方向

```text
Prompt RAG Agent 企业 AI 应用系统

- 基于 NestJS 设计 AI Orchestrator，将聊天请求拆分为 Input、Context、Prompt、RAG、Tool、Stream 六阶段，提升 AI 链路可维护性。
- 实现企业知识库 RAG pipeline，支持文档解析、Chunk 分块、Ollama Embedding、Qdrant 向量存储、混合检索；知识库检索 API 支持 citations 返回。
- 实现 Prompt 模板系统和 Context Engine，将 Prompt、历史消息、摘要、RAG、工具结果统一为 ContextBlock，并基于 token budget 做上下文裁剪。
- 实现 Agent ReAct 调度，支持 direct / agent 路由、工具 JSON 解析、ToolRegistry 执行、多步骤工具调用和最终流式回答。
- 增加 Prompt Injection 防护、工具白名单、知识库权限过滤和 SSE 断线续传，提升系统安全性和稳定性。
```

## 简历版本 3：前端转 AI 应用综合方向

```text
Prompt RAG Agent：面向企业知识库的 AI 应用平台

- 从前端交互到后端 AI 编排完整实现 RAG Agent 链路，覆盖流式聊天、Prompt 模板、知识库检索、检索预览引用、工具调用和 Agent 时间线。
- 前端基于 SSE 实现 token 级流式体验，支持工具调用过程和多步骤 Agent 执行状态可视化，并提供知识库检索引用展示能力。
- 后端基于 NestJS 构建 AI Orchestrator 和 Context Engine，统一治理 Prompt、历史消息、RAG、工具结果和 token budget。
- RAG 层基于 Ollama Embedding + Qdrant 实现文档向量化和混合检索，支持企业知识库权限过滤；检索预览支持引用追溯，聊天引用事件化可作为后续增强。
```

---

# 第十六部分：岗位匹配总结

## 你适合投哪些岗位

优先投：

- AI 前端工程师
- AI 应用开发工程师
- AI 产品工程师
- 大模型应用开发工程师
- RAG 应用开发工程师
- Agent 应用开发工程师
- 前端工程师（AI 产品方向）

谨慎投：

- 大模型算法工程师
- NLP 算法工程师
- 训练推理优化工程师
- CUDA / 推理引擎工程师

原因：

你的优势是应用落地和产品工程，不是底层算法训练。面试时要主动把自己定位到“AI 应用工程化”。

## 你的核心竞争力

```text
前端工程经验
  + AI 交互体验
  + NestJS 全栈能力
  + RAG 知识库
  + Agent 工具调用
  + Context 编排
  + 安全和权限意识
  = AI 应用开发竞争力
```

## 最终面试策略

面试时要避免只讲“我用了某某技术”，而要讲“我解决了什么问题”：

- 不说“我用了 SSE”，要说“我用 SSE 降低 AI 生成等待感，并支持增量消息展示”。
- 不说“我用了 Qdrant”，要说“我用向量数据库解决企业文档语义检索问题”。
- 不说“我用了 Agent”，要说“我让模型可以根据任务主动调用工具并多步完成复杂问题”。
- 不说“我写了 Prompt”，要说“我把 Prompt 模板化，保证不同业务场景输出稳定可控”。

---

# 第十七部分：真实性审校清单

这一部分用于面试前自检，避免把“设计方向”说成“已经完整落地”。

## 可以放心作为项目成果讲

| 能力 | 真实性说明 | 关键落点 |
|------|------------|----------|
| SSE 流式聊天 | 已有前后端流式链路，支持 streamId 续传和前端重试 | `ConversationStreamService`、`StreamSessionService`、`AIClient`、`StreamAdapter` |
| Prompt 模板 | 后端 JSON 模板加载，前端有模板选择组件 | `PromptTemplateService`、`src/ai/prompts/*.json`、`PromptTemplatePicker` |
| Function Calling | Prompt JSON 工具调用方案，包含工具 Prompt、解析、注册和执行 | `ToolPromptService`、`ToolCallParserService`、`ToolRegistryService` |
| weather 工具 | 支持 mock，配置 API key 时可请求 OpenWeather，失败降级 mock | `weather.tool.ts` |
| RAG 文档入库 | 支持解析、分块、Embedding、MySQL Chunk、Qdrant upsert | `IngestService`、`ChunkService`、`EmbeddingService`、`QdrantService` |
| 混合检索 | Qdrant 向量召回 + MySQL 关键词召回 + 分数融合 | `RetrievalService` |
| 知识库检索预览引用 | 检索 API 返回 citations，前端详情页用 CitationBlock 展示 | `RetrievalService.toCitations()`、`CitationBlock` |
| Agent ReAct | 支持 direct / agent 路由、最多 5 步工具循环、工具事件 SSE | `AgentRouterService`、`AgentOrchestratorService` |
| searchKnowledgeBase 工具 | Agent 工具可检索用户已选知识库，返回 chunks 给模型推理 | `knowledge-base-search.tool.ts` |
| Context Engine | 已有 ContextBlock、ContextPlan、token budget、pruning、composer、memory | `context-engine/*` |
| Prompt 安全 | 用户/RAG/工具/Memory 内容有边界包裹和工具参数净化 | `PromptGuardService`、`ContextComposerService` |
| MCP filesystem 示例 | 可通过配置启用 filesystem MCP，并以 `mcp_` 前缀注册工具 | `McpClientService`、`McpToolBridgeService` |

## 面试中要说成优化方向

| 能力 | 为什么不能说成已完整实现 | 正确说法 |
|------|--------------------------|----------|
| 聊天回答稳定展示 RAG 引用 | 当前聊天 RAG Stage 主要注入上下文，未见稳定 `rag_retrieval` SSE 事件传到聊天页 | “检索预览 citations 已实现，聊天回答引用事件化展示可继续补齐。” |
| 独立 rerank 阶段 | 当前是向量 + 关键词混合分数，没有独立 reranker 模型或 rerank service | “后续可增加 rerank 提升 Top-K 精排质量。” |
| Stream Event Bus | 有设计文档，但当前 `src` 未见独立 event bus 模块 | “已有事件总线设计方向，当前仍主要由 ConversationStreamService 处理 SSE 事件。” |
| Agent 步骤持久化 | 当前 Agent 步骤通过 SSE 展示，未见独立落库表 | “Agent step 持久化可作为审计和回放优化。” |
| 多企业系统 MCP | 当前接入的是 filesystem MCP 示例 | “MCP 可扩展到数据库、CRM、ERP，但当前项目只做 filesystem 示例。” |
| LangGraph 工作流 | 当前是 NestJS 原生 ReAct 循环 | “LangGraph 是后续工作流编排方向，当前没有引入。” |

## 面试自检话术

当面试官问“这个功能你们都做完了吗”，可以这样回答：

```text
我会区分已落地和优化方向。当前项目已经落地的是 SSE 流式聊天、Prompt 模板、RAG 入库检索、混合召回、Agent ReAct、Context Engine 和 PromptGuard。

还有一些是我明确知道可以继续增强的点，比如聊天回答中的 citations 事件化展示、独立 rerank、Agent step 持久化、Stream Event Bus 和更多 MCP 企业连接器。这些我不会说成已经完成，而是作为下一阶段优化计划。
```

---

## 结论

这个项目最值得学习的不是某一个接口，而是 AI 应用系统的工程分层：

```text
模型能力
  + Prompt 约束
  + RAG 知识
  + Agent 行动
  + Context 治理
  + Orchestrator 编排
  + 安全与权限
  = 可落地的企业级 AI 系统
```

只要能把这条主线讲清楚，你就不只是“会调大模型 API”，而是能设计和实现完整 AI 应用系统。

对于前端转 AI 应用开发来说，这个项目还可以作为你的转型样板：用前端优势做好 AI 交互体验，用全栈能力补齐 RAG、Agent 和上下文编排，用工程化思维把大模型能力变成可面试、可演示、可落地的系统。
