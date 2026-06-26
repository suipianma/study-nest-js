# AI 会话管理 + 长期记忆 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 聊天增加完整会话管理（CRUD、持久化、多轮上下文、超 40 条自动摘要长期记忆、自动标题）。

**Architecture:** 新建 `ConversationModule` 负责会话/消息持久化与上下文编排；`AiModule` 改为 Ollama `/api/chat` + messages[]；`SummaryService` 异步增量摘要；前端聊天页加会话侧边栏。

**Tech Stack:** NestJS 11, Prisma 6, MySQL, Redis, Ollama, Next.js 16, Ant Design 6, EventSource SSE

**Spec:** `docs/superpowers/specs/2026-06-11-conversation-management-design.md`

---

## 文件结构预览

### 后端新建

| 文件 | 职责 |
|------|------|
| `study-nest-js/src/conversation/conversation.module.ts` | 模块注册 |
| `study-nest-js/src/conversation/conversation.controller.ts` | HTTP + SSE 入口 |
| `study-nest-js/src/conversation/conversation.service.ts` | 会话/消息 CRUD |
| `study-nest-js/src/conversation/context-builder.service.ts` | 组装 summary + recent |
| `study-nest-js/src/conversation/summary.service.ts` | 增量摘要 |
| `study-nest-js/src/conversation/title.service.ts` | 自动标题 |
| `study-nest-js/src/conversation/dto/*.ts` | 请求 DTO |
| `study-nest-js/src/ai/types/chat-message.type.ts` | 共享 ChatMessage 类型 |

### 后端修改

| 文件 | 变更 |
|------|------|
| `study-nest-js/prisma/schema.prisma` | 新增 Conversation + Message |
| `study-nest-js/src/ai/providers/ai.provider.ts` | 接口改 messages[] |
| `study-nest-js/src/ai/providers/ollama.provider.ts` | /api/chat |
| `study-nest-js/src/ai/ai.service.ts` | 接收 messages[]，缓存 key 改造 |
| `study-nest-js/src/ai/ai-cache.service.ts` | 缓存 key 含 summary |
| `study-nest-js/src/ai/ai.controller.ts` | 标记废弃或移除旧 stream |
| `study-nest-js/src/app.module.ts` | 注册 ConversationModule |

### 前端新建/修改

| 文件 | 变更 |
|------|------|
| `admin-web/services/conversation.ts` | 会话 API |
| `admin-web/components/ConversationSidebar.tsx` | 会话列表 UI |
| `admin-web/services/ai.ts` | streamChat(conversationId, content) |
| `admin-web/app/chat/page.tsx` | 接入会话管理 |
| `admin-web/app/globals.css` | 侧边栏样式 |

---

## Task 1: Prisma 数据模型

**Files:**
- Modify: `study-nest-js/prisma/schema.prisma`
- Run: migration

- [ ] **Step 1: 在 schema.prisma 追加模型**

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
  role           String       @db.VarChar(20)
  content        String       @db.Text
  thinking       String?      @db.Text
  fromCache      Boolean      @default(false)
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

- [ ] **Step 2: 执行迁移**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm run prisma:migrate:dev -- --name add_conversation_message
pnpm run prisma:generate
```

Expected: 迁移成功，无 schema 错误

---

## Task 2: 共享 ChatMessage 类型 + AI Provider 改造

**Files:**
- Create: `study-nest-js/src/ai/types/chat-message.type.ts`
- Modify: `study-nest-js/src/ai/providers/ai.provider.ts`
- Modify: `study-nest-js/src/ai/providers/ollama.provider.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
// study-nest-js/src/ai/types/chat-message.type.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

- [ ] **Step 2: 更新 AIProvider 接口**

```typescript
// ai.provider.ts
import { ChatMessage } from '../types/chat-message.type';

export interface ChatReply {
  thinking: string;
  response: string;
}

export interface AIProvider {
  chat(messages: ChatMessage[]): Promise<ChatReply>;
  streamChat(messages: ChatMessage[]): Observable<MessageEvent>;
}
```

- [ ] **Step 3: OllamaProvider 改用 /api/chat**

将 `chat(prompt)` 和 `streamChat(prompt)` 改为接收 `messages: ChatMessage[]`：

```typescript
// ollama.provider.ts 请求体
body: JSON.stringify({ model, messages, stream: true | false })
```

流式解析逻辑保持不变（累加 thinking/response）。

- [ ] **Step 4: 验证编译**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm exec nest build
```

Expected: 会因 AiService 仍用旧签名而报错 — Task 3 修复

---

## Task 3: AiService + AiCacheService 改造

**Files:**
- Modify: `study-nest-js/src/ai/ai.service.ts`
- Modify: `study-nest-js/src/ai/ai-cache.service.ts`

- [ ] **Step 1: 缓存 key 改为 messages + summary**

```typescript
// ai-cache.service.ts
buildKey(messages: ChatMessage[], summary?: string | null): string {
  const payload = JSON.stringify({ summary: summary ?? '', messages });
  const hash = createHash('sha256').update(payload).digest('hex');
  return `ai:cache:${this.model}:${hash}`;
}
```

`get` / `set` 方法签名同步改为接收 `messages` 和可选 `summary`。

- [ ] **Step 2: AiService 方法签名改造**

```typescript
async chat(messages: ChatMessage[], summary?: string | null): Promise<ChatReply>
streamChat(messages: ChatMessage[], summary?: string | null): Observable<MessageEvent>
```

内部调用 `cacheService.get(messages, summary)` 和 `provider.streamChat(messages)`。

- [ ] **Step 3: 编译验证**

```powershell
pnpm exec nest build
```

Expected: 会因 ConversationModule 未建而暂时通过（AiController 仍用旧接口，下一步处理）

---

## Task 4: ConversationService（CRUD + 消息读写）

**Files:**
- Create: `study-nest-js/src/conversation/conversation.service.ts`
- Create: `study-nest-js/src/conversation/dto/create-conversation.dto.ts`
- Create: `study-nest-js/src/conversation/dto/update-conversation.dto.ts`

- [ ] **Step 1: 环境变量常量**

```typescript
// conversation/constants.ts
export const CONVERSATION_MAX_MESSAGES = Number(process.env.CONVERSATION_MAX_MESSAGES ?? 200);
export const CONVERSATION_SUMMARY_TRIGGER = Number(process.env.CONVERSATION_SUMMARY_TRIGGER ?? 40);
export const CONVERSATION_RECENT_COUNT = Number(process.env.CONVERSATION_RECENT_COUNT ?? 20);
export const CONVERSATION_SUMMARY_MAX_CHARS = Number(process.env.CONVERSATION_SUMMARY_MAX_CHARS ?? 2000);
```

- [ ] **Step 2: ConversationService 核心方法**

```typescript
class ConversationService {
  findAllByUser(userId: number)           // 列表
  create(userId: number)                   // 新建，title='新对话'
  updateTitle(id, userId, title)           // 重命名，校验归属
  remove(id, userId)                       // 删除，校验归属
  findOneOrFail(id, userId)                // 获取会话，403/404
  getMessages(conversationId, userId)      // 消息列表
  countMessages(conversationId)            // 计数
  createUserMessage(conversationId, content)   // 写 user 消息
  createAssistantMessage(conversationId, data) // 写 assistant 消息
  assertMessageLimit(conversationId)       // 超限抛 BadRequestException
}
```

- [ ] **Step 3: 编写 DTO**

```typescript
// update-conversation.dto.ts
export class UpdateConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;
}
```

---

## Task 5: ContextBuilderService + SummaryService

**Files:**
- Create: `study-nest-js/src/conversation/context-builder.service.ts`
- Create: `study-nest-js/src/conversation/summary.service.ts`

- [ ] **Step 1: ContextBuilderService**

```typescript
@Injectable()
export class ContextBuilderService {
  build(
    conversation: Conversation,
    dbMessages: DbMessage[],
  ): ChatMessage[] {
    if (dbMessages.length <= CONVERSATION_SUMMARY_TRIGGER) {
      return dbMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'assistant' && m.thinking
          ? `${m.thinking}\n${m.content}`
          : m.content,
      }));
    }

    const recent = dbMessages
      .filter((m) => conversation.summarizedMessageId
        ? m.id > conversation.summarizedMessageId
        : true)
      .slice(-CONVERSATION_RECENT_COUNT);

    const result: ChatMessage[] = [];
    if (conversation.summary) {
      result.push({
        role: 'system',
        content: `历史对话摘要：\n${conversation.summary}`,
      });
    }
    recent.forEach((m) => {
      result.push({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      });
    });
    return result;
  }
}
```

- [ ] **Step 2: SummaryService**

```typescript
@Injectable()
export class SummaryService {
  // 判断是否需要更新摘要
  needsSummary(conversation, messages): boolean

  // 同步初始摘要（首次超 40 条）
  async generateInitialSummary(conversationId): Promise<void>

  // 异步增量摘要（回复后 fire-and-forget）
  scheduleSummaryUpdate(conversationId): void

  private async updateSummary(conversationId): Promise<void> {
    // 1. 取 summarizedMessageId 之后、recent 窗口之前的消息
    // 2. 调 Ollama 非流式生成摘要
    // 3. 更新 conversation.summary + summarizedMessageId
    // 4. 超长则二次压缩
  }
}
```

摘要 Prompt 见 spec §6.2。

---

## Task 6: TitleService

**Files:**
- Create: `study-nest-js/src/conversation/title.service.ts`

- [ ] **Step 1: 实现标题逻辑**

```typescript
@Injectable()
export class TitleService {
  // 首条用户消息 → 截断标题
  truncateTitle(content: string): string {
    return content.length > 24 ? content.slice(0, 24) + '...' : content;
  }

  // 异步 AI 优化标题
  async refineTitle(conversationId: number, userMsg: string, assistantMsg: string): Promise<void> {
    try {
      const title = await this.aiProvider.chat([{
        role: 'user',
        content: `请为以下对话生成一个不超过20字的标题，只返回标题文字：\n用户：${userMsg}\n助手：${assistantMsg}`,
      }]);
      const refined = title.response.slice(0, 20).trim();
      if (refined) await this.prisma.conversation.update({ where: { id: conversationId }, data: { title: refined } });
    } catch {
      // 失败保留截断标题
    }
  }
}
```

---

## Task 7: ConversationController + SSE 流式发送

**Files:**
- Create: `study-nest-js/src/conversation/conversation.controller.ts`
- Create: `study-nest-js/src/conversation/conversation.module.ts`
- Modify: `study-nest-js/src/app.module.ts`

- [ ] **Step 1: Controller 路由**

```typescript
@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ConversationController {
  @Get()           findAll(@Req() req)
  @Post()          create(@Req() req)
  @Patch(':id')    update(@Param('id') id, @Body() dto, @Req() req)
  @Delete(':id')   remove(@Param('id') id, @Req() req)
  @Get(':id/messages')  getMessages(@Param('id') id, @Req() req)

  @Sse(':id/stream')
  stream(
    @Param('id') id: string,
    @Query('content') content: string,
    @Req() req,
  ): Observable<MessageEvent>
}
```

从 JWT payload 取 `userId`（与 auth.service 签发字段一致）。

- [ ] **Step 2: stream 编排逻辑**

```typescript
// conversation.controller.ts 或抽到 conversation-stream.service.ts
async streamMessage(conversationId, userId, content) {
  await conversationService.findOneOrFail(conversationId, userId);
  await conversationService.assertMessageLimit(conversationId);
  await conversationService.createUserMessage(conversationId, content);

  const conversation = await ...;
  const messages = await conversationService.getMessages(...);
  const isFirstUserMsg = messages.filter(m => m.role === 'user').length === 1;

  if (isFirstUserMsg) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: titleService.truncateTitle(content) },
    });
  }

  // 首次超 40 条同步摘要
  if (summaryService.needsSummary(conversation, messages)) {
    await summaryService.generateInitialSummary(conversationId);
    // 重新加载 conversation
  }

  const ollamaMessages = contextBuilder.build(conversation, messages);
  return aiService.streamChat(ollamaMessages, conversation.summary).pipe(
    // tap 累积 thinking/response
    // finalize: 写 assistant message, 更新 updatedAt, 异步 refineTitle + scheduleSummary
  );
}
```

- [ ] **Step 3: 注册模块**

```typescript
// app.module.ts imports 加 ConversationModule
```

- [ ] **Step 4: 废弃旧 AI stream**

```typescript
// ai.controller.ts — 删除 @Sse('stream') 或加 @Deprecated 注释
```

- [ ] **Step 5: 编译 + 手动验证**

```powershell
pnpm exec nest build
pnpm run start:dev
```

Swagger 测试：
- POST `/conversations` → 返回新会话
- GET `/conversations` → 列表
- SSE `/conversations/1/stream?content=你好`

---

## Task 8: 前端 conversation 服务

**Files:**
- Create: `admin-web/services/conversation.ts`

- [ ] **Step 1: 封装 API**

```typescript
// admin-web/services/conversation.ts
import request from "./request";

export interface Conversation {
  id: number;
  title: string;
  updatedAt: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  fromCache?: boolean;
  createdAt: string;
}

export function fetchConversations() {
  return request.get<Conversation[]>("/conversations");
}

export function createConversation() {
  return request.post<Conversation>("/conversations");
}

export function updateConversation(id: number, title: string) {
  return request.patch<Conversation>(`/conversations/${id}`, { title });
}

export function deleteConversation(id: number) {
  return request.delete(`/conversations/${id}`);
}

export function fetchMessages(conversationId: number) {
  return request.get<ConversationMessage[]>(`/conversations/${conversationId}/messages`);
}
```

---

## Task 9: 前端 ai.ts 改造

**Files:**
- Modify: `admin-web/services/ai.ts`

- [ ] **Step 1: streamChat 改签名**

```typescript
export function streamChat(
  conversationId: number,
  content: string,
  { onUpdate, onDone, onError }: StreamChatOptions
): () => void {
  const params = new URLSearchParams({ content });
  const url = `${API_BASE}/conversations/${conversationId}/stream?${params.toString()}`;
  // EventSource 需要带 JWT — EventSource 不支持自定义 header
  // 方案：query 传 token 或在后端 SSE 也支持 cookie
}
```

- [ ] **Step 2: SSE 鉴权方案**

EventSource 无法带 `Authorization` header。采用 **query token** 方式：

后端 `conversation.controller.ts` stream 端点：
- 优先读 `Authorization` header（axios 场景）
- SSE 场景读 `?token=xxx` query，用 JwtService 验证

前端：
```typescript
const token = getToken();
if (token) params.set("token", token);
const url = `${API_BASE}/conversations/${conversationId}/stream?${params}`;
const es = new EventSource(url);
```

需在 `study-nest-js` 增加 SSE token 验证 guard 或 middleware。

---

## Task 10: ConversationSidebar 组件

**Files:**
- Create: `admin-web/components/ConversationSidebar.tsx`
- Modify: `admin-web/app/globals.css`

- [ ] **Step 1: 侧边栏 UI**

```tsx
// 功能：
// - 顶部「新建会话」按钮
// - 会话列表（title + 选中态）
// - 每项 hover 显示 Dropdown：重命名 / 删除
// - 重命名 Modal（Input + 确认）
// - 删除 Popconfirm
// - props: conversations, activeId, onSelect, onCreate, onRename, onDelete
```

- [ ] **Step 2: CSS 布局**

```css
.chat-layout { display: flex; height: calc(100vh - header); }
.chat-sidebar { width: 260px; flex-shrink: 0; border-right: 1px solid var(--color-border); }
.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
@media (max-width: 768px) { .chat-sidebar { display: none; } /* Drawer 代替 */ }
```

---

## Task 11: 聊天页接入会话管理

**Files:**
- Modify: `admin-web/app/chat/page.tsx`

- [ ] **Step 1: 状态扩展**

```typescript
const [conversations, setConversations] = useState<Conversation[]>([]);
const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [sidebarOpen, setSidebarOpen] = useState(false); // 移动端
```

- [ ] **Step 2: 初始化加载**

```typescript
useEffect(() => {
  async function init() {
    const list = await fetchConversations();
    setConversations(list);
    if (list.length > 0) {
      setActiveConversationId(list[0].id);
      loadMessages(list[0].id);
    } else {
      const created = await createConversation();
      setConversations([created]);
      setActiveConversationId(created.id);
    }
  }
  init();
}, []);
```

- [ ] **Step 3: 改造 handleSend**

```typescript
function handleSend(text?: string) {
  if (!activeConversationId) return;
  // ...
  stopStreamRef.current = streamChat(activeConversationId, content, { ... });
}
```

- [ ] **Step 4: 切换会话**

```typescript
async function handleSelectConversation(id: number) {
  if (streaming) return;
  setActiveConversationId(id);
  await loadMessages(id);
}
```

`loadMessages` 将后端 `ConversationMessage[]` 映射为页面 `ChatMessage[]`。

- [ ] **Step 5: 发送后刷新会话列表（updatedAt 排序）**

---

## Task 12: 端到端验证

- [ ] **Step 1: 后端启动**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm run start:dev
```

- [ ] **Step 2: 前端启动**

```powershell
Set-Location "d:\Note\NestJS\admin-web"
npm run dev
```

- [ ] **Step 3: 验证清单**

| # | 操作 | 预期 |
|---|------|------|
| 1 | 登录 → 进入聊天 | 自动创建或加载最近会话 |
| 2 | 连续对话 3 轮 | AI 能引用上一轮内容 |
| 3 | 刷新页面 | 会话和消息仍在 |
| 4 | 新建会话 | 空消息区，可独立对话 |
| 5 | 重命名 | 标题更新 |
| 6 | 删除会话 | 切换至其他会话 |
| 7 | 发送 41+ 条（可写脚本循环） | 摘要写入 DB，模型仍能引用早期话题 |
| 8 | 第 201 条 | 提示达上限 |
| 9 | 相同上下文重复提问 | Redis 缓存命中，显示「缓存」标签 |

- [ ] **Step 4: 检查日志**

确认摘要更新日志：`[user:x] summary updated for conversation y`

---

## 执行顺序依赖

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7
                                                      ↓
                              Task 8 → Task 9 → Task 10 → Task 11 → Task 12
```

Task 7 完成前前端无法联调；Task 8-11 可并行准备组件代码。

---

## 风险与注意事项

1. **SSE 鉴权**：EventSource 不支持自定义 header，必须实现 query token 方案（Task 9）
2. **assistant 消息中的 thinking**：存入 DB 分字段存储，发给 Ollama 时只发 `content`（thinking 已结束）
3. **摘要同步阻塞**：仅首次超 40 条时同步，需在 UI 显示 loading 状态
4. **旧 `/ai/stream` 接口**：前端改造完成后删除，避免双入口
