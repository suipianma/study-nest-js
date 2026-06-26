# AI 会话管理 + 长期记忆 设计规格

**日期：** 2026-06-11  
**状态：** 已批准  
**范围：** study-nest-js（后端）+ admin-web（前端）

---

## 1. 背景与目标

当前 AI 聊天为「一问一答」：每次仅发送单条 `prompt`，消息仅存前端 React state，刷新即丢失，模型无多轮上下文。

**目标：**

- 完整会话管理（新建 / 切换 / 重命名 / 删除）
- 消息持久化（MySQL）
- 多轮上下文带给 Ollama
- 超过 40 条后自动摘要，实现长期记忆
- 自动生成会话标题
- 单会话消息存储上限

---

## 2. 技术栈（现有）


| 层     | 技术                                              |
| ----- | ----------------------------------------------- |
| 后端框架  | NestJS 11 + Prisma 6 + MySQL                    |
| 缓存    | Redis（AI 回答缓存，需改造 key）                          |
| AI    | Ollama，从 `/api/generate` 迁移至 `/api/chat`        |
| 鉴权    | JWT（`AuthGuard('jwt')`）                         |
| 前端    | Next.js 16 App Router + React 19 + Ant Design 6 |
| AI 通信 | EventSource SSE                                 |


---

## 3. 数据模型

### 3.1 Prisma Schema

```prisma
model Conversation {
  id                   Int       @id @default(autoincrement())
  userId               Int
  title                String    @db.VarChar(100)
  summary              String?   @db.Text
  summarizedMessageId  Int?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  messages             Message[]

  @@index([userId, updatedAt])
}

model Message {
  id             Int          @id @default(autoincrement())
  conversationId Int
  role           String       @db.VarChar(20)  // user | assistant
  content        String       @db.Text
  thinking       String?      @db.Text
  fromCache      Boolean      @default(false)
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

### 3.2 字段说明


| 字段                                 | 说明                    |
| ---------------------------------- | --------------------- |
| `Conversation.summary`             | 滚动摘要，长期记忆             |
| `Conversation.summarizedMessageId` | 已纳入摘要的最后一条 Message.id |
| `Message.thinking`                 | AI 思考过程（assistant 消息） |
| `Message.fromCache`                | 是否来自 Redis 缓存         |


---

## 4. 环境变量


| 变量                               | 默认值   | 说明               |
| -------------------------------- | ----- | ---------------- |
| `CONVERSATION_MAX_MESSAGES`      | 200   | 单会话最大存储消息数       |
| `CONVERSATION_SUMMARY_TRIGGER`   | 40    | 超过此数启用摘要模式       |
| `CONVERSATION_RECENT_COUNT`      | 20    | 发给模型的近期完整消息条数    |
| `CONVERSATION_SUMMARY_MAX_CHARS` | 2000  | 摘要最大字符数（超出二次压缩）  |
| `AI_CACHE_TTL`                   | 86400 | Redis 缓存 TTL（已有） |


---

## 5. 后端 API

所有接口需 `AuthGuard('jwt')`，且 `conversation.userId` 必须等于 token 内 `userId`。

### 5.1 会话 CRUD


| 方法     | 路径                   | 说明                      |
| ------ | -------------------- | ----------------------- |
| GET    | `/conversations`     | 列表，按 `updatedAt` 降序     |
| POST   | `/conversations`     | 新建空会话，默认标题「新对话」         |
| PATCH  | `/conversations/:id` | 重命名 `{ title: string }` |
| DELETE | `/conversations/:id` | 删除会话（级联删消息）             |


### 5.2 消息


| 方法  | 路径                                      | 说明                |
| --- | --------------------------------------- | ----------------- |
| GET | `/conversations/:id/messages`           | 获取历史消息            |
| SSE | `/conversations/:id/stream?content=xxx` | 发送用户消息并流式返回 AI 回复 |


> 旧接口 `GET /ai/stream?prompt=` 标记废弃，实现完成后移除或保留 1 个版本兼容期。

### 5.3 发送消息流程（SSE）

```
1. JWT 鉴权 + 校验会话归属
2. 校验消息数 < CONVERSATION_MAX_MESSAGES，否则 400
3. 写入 user Message
4. 读取全部历史消息
5. ContextBuilder 组装 messages[]（见 §6）
6. AiService.streamChat(messages) → Ollama /api/chat
7. SSE 流式返回 thinking + response
8. 流结束写入 assistant Message
9. 更新 conversation.updatedAt
10. 首条用户消息 → 截断生成初始标题（24 字）
11. 首条 AI 回复后 → 异步 AI 优化标题（失败保留截断标题）
12. 异步 SummaryService 增量更新摘要（见 §6）
```

### 5.4 错误码


| 场景         | HTTP | message                             |
| ---------- | ---- | ----------------------------------- |
| 会话不存在      | 404  | 会话不存在                               |
| 非本人会话      | 403  | 无权访问此会话                             |
| 消息达上限      | 400  | 会话消息已达上限，请新建会话                      |
| content 为空 | 400  | 消息内容不能为空                            |
| 流式中断       | —    | 写入 assistant 消息，content 追加 `[回复中断]` |


---

## 6. 长期记忆：摘要机制

### 6.1 上下文组装（ContextBuilderService）

```
if (messages.length <= SUMMARY_TRIGGER) {
  // 全量发送，无 system
  return messages.map(toOllamaFormat)
}

// 启用摘要模式
recent = messages where id > summarizedMessageId, take last RECENT_COUNT
system = { role: 'system', content: `历史对话摘要：\n${summary ?? '（暂无）'}` }
return [system, ...recent.map(toOllamaFormat)]
```

### 6.2 摘要更新（SummaryService）

**触发条件：** `messages.length > SUMMARY_TRIGGER` 且存在 `id > summarizedMessageId` 且不在 recent 窗口内的消息。

**策略：**


| 场景                 | 行为                                       |
| ------------------ | ---------------------------------------- |
| 首次超 40 条且无 summary | 同步生成初始摘要（仅此一次允许阻塞）                       |
| 后续新增旧消息            | 异步增量摘要，不阻塞用户请求                           |
| 摘要失败               | 降级为仅发 recent + 已有 summary，打 warn 日志，下次重试 |
| 摘要超长               | 二次压缩至 SUMMARY_MAX_CHARS                  |


**增量 Prompt：**

```
请将以下对话历史压缩为简洁摘要（200-400字），保留：
- 用户核心问题和目标
- 已达成的结论/方案
- 用户偏好、技术栈等关键事实
- 尚未解决的问题

【已有摘要】
{existingSummary || '无'}

【新增对话】
{messagesToSummarize 格式化为 role: content}
```

更新后：`conversation.summary = 新摘要`，`conversation.summarizedMessageId = 最后一条被摘要消息的 id`。

### 6.3 缓存 Key 改造

```
cacheKey = sha256(model + summary + JSON.stringify(recentMessages))
```

摘要变化后自然失效，避免误命中。

---

## 7. AI 层改造

### 7.1 OllamaProvider

从 `/api/generate` 迁移至 `/api/chat`：

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 请求体
{ model, messages: ChatMessage[], stream: true | false }
```

流式响应继续解析 `thinking` + `response` 字段（qwen3 等模型）。

### 7.2 AIProvider 接口变更

```typescript
interface AIProvider {
  chat(messages: ChatMessage[]): Promise<ChatReply>;
  streamChat(messages: ChatMessage[]): Observable<MessageEvent>;
}
```

---

## 8. 自动标题


| 阶段          | 规则                                         |
| ----------- | ------------------------------------------ |
| 首条用户消息发送后   | `title = content.slice(0, 24)` + 超长加 `...` |
| 首条 AI 回复完成后 | 异步调用 Ollama 生成 ≤20 字标题                     |
| AI 标题失败     | 保留截断标题                                     |


标题 Prompt：`请为以下对话生成一个不超过20字的标题，只返回标题文字：\n用户：{userMsg}\n助手：{assistantMsg}`

---

## 9. 前端设计

### 9.1 布局

```
┌─────────────────┬──────────────────────────┐
│ 会话列表         │  消息区（现有气泡 UI）       │
│ [+ 新建会话]     │                          │
│ 标题 + ⋮ 菜单    │  底部输入框                │
│ (重命名/删除)    │                          │
└─────────────────┴──────────────────────────┘
```

移动端：会话列表用 Ant Design `Drawer`。

### 9.2 新增文件


| 文件                                   | 职责               |
| ------------------------------------ | ---------------- |
| `services/conversation.ts`           | 会话 CRUD API      |
| `components/ConversationSidebar.tsx` | 会话列表 + 新建/重命名/删除 |
| `hooks/useConversation.ts`           | 会话状态管理（可选）       |


### 9.3 改造文件


| 文件                  | 变更                                         |
| ------------------- | ------------------------------------------ |
| `services/ai.ts`    | `streamChat(conversationId, content, ...)` |
| `app/chat/page.tsx` | 接入会话侧边栏，切换加载历史                             |
| `app/globals.css`   | 会话侧边栏样式                                    |


### 9.4 页面行为

1. 进入 `/chat`：拉会话列表 → 选中最近会话；无会话则自动新建
2. 切换会话：拉历史消息渲染
3. 发送消息：走 `/conversations/:id/stream`
4. 新建会话：POST → 切换 activeId
5. 重命名：Modal + PATCH
6. 删除：Popconfirm + DELETE → 切换至下一会话或新建
7. 达上限：`message.warning('会话消息已达上限，请新建会话')`

### 9.5 状态管理

继续使用页面级 `useState`（与项目现状一致），不引入新状态库。

---

## 10. 模块划分（后端）

```
src/conversation/
├── conversation.module.ts
├── conversation.controller.ts
├── conversation.service.ts
├── context-builder.service.ts
├── summary.service.ts
├── title.service.ts
└── dto/
    ├── create-conversation.dto.ts
    ├── update-conversation.dto.ts
    └── stream-message.dto.ts
```

`AiModule` 改造为接收 `ChatMessage[]`，由 `ConversationModule` 编排。

---

## 11. 不在本次范围

- 消息编辑 / 重新生成
- 会话搜索 / 标签 / 文件夹
- 前端展示摘要内容（可后续迭代）
- WebSocket ChatModule 接入 AI
- 多用户共享会话

---

## 12. 验收标准

- [ ] 用户可新建、切换、重命名、删除会话
- [ ] 刷新页面后会话和消息不丢失
- [ ] 模型能感知同会话内前几轮对话
- [ ] 超过 40 条后旧消息被摘要，模型仍能引用早期内容
- [ ] 首条消息自动生成标题，AI 异步优化标题
- [ ] 单会话超 200 条时拒绝发送并提示
- [ ] 用户只能访问自己的会话
- [ ] 缓存 key 包含 summary + recent messages