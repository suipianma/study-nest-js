# AI 应用工程师成长路线（适合前端转 AI 全栈）

你现在的基础：

* React / Vue
* 前端工程经验
* 多端开发
* 有一定项目经验

你的目标应该是：

> 6~9 个月成长为「AI 应用工程师 / AI 全栈工程师」

重点不是卷算法，而是：

* AI 工程化
* 企业 AI 应用
* Agent
* 工作流
* 全栈能力
* 商业落地

---

# 一、整体路线图

```txt id="7u9zfx"
前端工程师
    ↓
Node/NestJS 全栈
    ↓
数据库 & Redis & Docker
    ↓
Python + FastAPI
    ↓
LLM API & AI 工程
    ↓
RAG
    ↓
Agent & Workflow
    ↓
企业 AI 系统
    ↓
AI SaaS / AI 工程师
```

---

# 二、阶段 1：全栈基础（第 1~2 个月）

这是最重要的阶段。

因为未来 AI 项目：

> 本质上仍然是软件工程。

---

# 1. Node.js

## 学习目标

掌握：

* HTTP
* 中间件
* JWT
* 文件上传
* WebSocket
* Redis
* 定时任务

---

## 推荐资料

### 官方

* [Node.js 官方文档](https://nodejs.org/en/docs?utm_source=chatgpt.com)

### 视频

* [Node.js Crash Course - Traversy Media](https://www.youtube.com/watch?v=fBNz5xF-Kx4&utm_source=chatgpt.com)

---

# 2. NestJS（重点）

你现在已经在学，继续深入。

---

## 必学内容

### 基础

* Module
* Controller
* Service
* Dependency Injection

---

### 核心

* JWT 登录
* RBAC 权限
* DTO
* ValidationPipe
* Exception Filter
* Interceptor
* Swagger

---

### 进阶

* WebSocket
* Redis
* Queue
* Schedule
* 文件上传
* 日志系统

---

## 推荐资料

### 官方

* [NestJS 官方文档](https://docs.nestjs.com?utm_source=chatgpt.com)

### 视频

* [NestJS Zero to Hero](https://www.udemy.com/course/nestjs-zero-to-hero/?utm_source=chatgpt.com)

---

# 3. MySQL + Prisma

---

## 必学

### MySQL

* CRUD
* JOIN
* 索引
* 事务
* 慢查询

---

### Prisma

重点：

* schema
* migration
* relation
* transaction

---

## 推荐资料

### 官方

* [Prisma 官方文档](https://www.prisma.io/docs?utm_source=chatgpt.com)

---

# 4. Redis

未来 AI 系统大量使用。

---

## 必学

* 缓存
* session
* token
* rate limit
* pub/sub

---

## 推荐资料

* [Redis 官方文档](https://redis.io/docs/latest/?utm_source=chatgpt.com)

---

# 5. Docker（非常重要）

未来不会 Docker 很吃亏。

---

## 必学

* Dockerfile
* docker-compose
* volume
* network
* nginx

---

## 推荐资料

* [Docker 官方文档](https://docs.docker.com?utm_source=chatgpt.com)

---

# 阶段 1 项目（必须做）

你需要做：

# 「企业后台系统」

必须包含：

* JWT 登录
* RBAC
* 文件上传
* Redis
* WebSocket
* Swagger
* Docker

这个项目会成为后面 AI 项目的基础。

---

# 三、阶段 2：Python + AI 基础（第 3 个月）

---

# 1. Python

你不用学很深。

目标：

> 能接 AI 生态。

---

## 必学

* 基础语法
* async
* requests
* FastAPI

---

## 推荐资料

### 官方

* [Python 官方教程](https://docs.python.org/3/tutorial/?utm_source=chatgpt.com)

### FastAPI

* [FastAPI 官方文档](https://fastapi.tiangolo.com?utm_source=chatgpt.com)

---

# 2. OpenAI API / LLM API

---

## 必学

* Chat Completion
* Streaming
* Function Calling
* Structured Output
* Tool Calling

---

## 推荐资料

* [OpenAI Platform Docs](https://platform.openai.com/docs?utm_source=chatgpt.com)

---

# 3. AI 基础知识（不用卷算法）

你需要理解：

* Token
* Embedding
* Context Window
* Temperature
* Prompt
* RAG
* Agent

---

## 推荐

* [DeepLearning.AI Short Courses](https://www.deeplearning.ai/short-courses/?utm_source=chatgpt.com)

---

# 阶段 2 项目

做：

# 「AI Chat 应用」

功能：

* 流式输出
* 多轮对话
* Markdown 渲染
* 文件上传
* Function Calling

重点：

> 不只是聊天框，而是完整工程。

---

# 四、阶段 3：RAG（第 4 个月）

这是企业 AI 的核心。

---

# 必学内容

## 1. Embedding

理解：

* 文本向量化
* 相似度搜索

---

## 2. Chunk

学会：

* 文档切分
* chunk size
* overlap

---

## 3. Vector DB

推荐：

* Pinecone
* Chroma
* Weaviate

---

## 4. Rerank

理解：

* 为什么召回不准确
* 如何优化结果

---

# 推荐资料

* [LangChain Docs](https://python.langchain.com/docs/introduction/?utm_source=chatgpt.com)
* [LlamaIndex Docs](https://docs.llamaindex.ai?utm_source=chatgpt.com)

---

# 阶段 3 项目

做：

# 「AI 企业知识库」

支持：

* PDF 上传
* 文档解析
* RAG
* 引用来源
* 多用户
* 权限

这是非常有价值的项目。

---

# 五、阶段 4：Agent（第 5 个月）

未来重点方向。

---

# 必学

## 1. Tool Calling

让 AI：

* 调接口
* 查数据库
* 调工具

---

## 2. Workflow

让 AI：

* 多步骤执行
* 自动决策

---

## 3. Memory

长期记忆。

---

## 4. Multi-Agent

多个 Agent 协作。

---

# 推荐资料

* [LangGraph Docs](https://langchain-ai.github.io/langgraph/?utm_source=chatgpt.com)
* [AutoGen Docs](https://microsoft.github.io/autogen/?utm_source=chatgpt.com)

---

# 阶段 4 项目

做：

# 「AI 自动化工作流平台」

例如：

* 自动总结日报
* 自动生成报告
* 自动客服
* 自动分析数据

---

# 六、阶段 5：工程化（第 6 个月）

这是很多人缺的。

---

# 必学

## 1. 部署

* Docker
* nginx
* Linux
* PM2

---

## 2. 云服务

了解：

* Amazon Web Services
* Cloudflare
* Vercel

---

## 3. CI/CD

* GitHub Actions

---

## 4. 监控

* 日志
* tracing
* metrics

---

# 七、真正值得你做的项目（重点）

不要做：

* ChatGPT clone
* AI 套壳

太多人做了。

---

# 你该做：

## 1. AI 企业知识库

最适合接单。

---

## 2. AI CRM

企业愿意付费。

---

## 3. AI 表单系统

很有商业价值。

---

## 4. AI 工作流平台

未来潜力很大。

---

# 八、你未来应该关注的技术方向

未来几年重点：

---

## 必关注

* RAG
* Agent
* MCP
* Workflow
* AI Browser
* AI Coding
* Multi-Agent

---

## 不必太卷

* Transformer 数学推导
* 训练大模型
* CUDA

除非你走算法路线。

---

# 九、你的学习节奏（现实版）

每天：

## 工作日

3 小时：

```txt id="l76vv4"
1h 学习
1h coding
1h 做项目
```

---

## 周末

6~8 小时。

重点：

* 做项目
* 写完整功能
* Debug

---

# 十、未来你的竞争力会来自哪里

未来最值钱的不是：

> “会不会 AI”。

而是：

# 「能不能做复杂 AI 系统」

包括：

* 前端
* 后端
* AI
* 数据
* 工作流
* 部署
* 产品

这才是真正的护城河。

---

# 十一、给你的最终建议

你现在其实处于一个很好的位置。

因为：

* 你懂工程
* 有前端经验
* 愿意学习
* 对 AI 敏感

很多纯前端还没意识到：

未来：

> “AI + 工程能力”
> 会成为非常强的组合。

所以你接下来不要焦虑：

“AI 会不会淘汰我”。

而应该：

> 用未来 6~12 个月，把自己升级成下一代工程师。
