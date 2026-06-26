# AI Prompt 模板（Role/Task/Context/Constraint/Output）设计规格

**日期：** 2026-06-17  
**状态：** 已批准  
**范围：** study-nest-js（后端）+ admin-web（前端聊天页）

---

## 1. 背景与目标

项目 `AI学习扩展.md` 已定义 Prompt 工程结构：Role、Task、Context、Constraint、Output。当前聊天页仅有硬编码快捷建议（`SUGGESTIONS`），后端摘要/标题 prompt 散落在 Service 内，缺少可复用的模板机制。

**目标：**

- 后端以 JSON 文件维护 Prompt 模板
- 聊天页提供预设模板选择（方案 A）
- 用户填写 Context 后发送，后端组装 `system` message 注入 Ollama
- 会话绑定模板，多轮对话保持同一 Role/约束

**本期不做：**

- 管理后台 CRUD 模板
- 模板热更新（改文件需重启后端）
- 多 Context 字段表单（仅单行/多行文本）

---

## 2. 技术栈（现有）

| 层 | 技术 |
|----|------|
| 后端 | NestJS 11 + Prisma 6 + MySQL |
| AI | Ollama `/api/chat`，messages[] |
| 前端 | Next.js 16 App Router + Ant Design 6 |
| 通信 | EventSource SSE `GET /conversations/:id/stream` |

---

## 3. 模板文件格式

**目录：** `study-nest-js/src/ai/prompts/*.json`

**示例：** `frontend-interviewer.json`

```json
{
  "id": "frontend-interviewer",
  "name": "前端面试官",
  "description": "根据技术栈生成中级面试题（不含答案）",
  "role": "你是一名资深前端面试官",
  "task": "请根据用户技术栈生成面试题",
  "contextLabel": "用户技术栈",
  "contextPlaceholder": "React、Vue、TypeScript",
  "constraints": ["难度中级", "不要给答案"],
  "outputFormat": "Markdown格式"
}
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| id | 是 | 唯一标识，文件名与 id 一致 |
| name | 是 | 前端展示名 |
| description | 是 | 模板简介 |
| role | 是 | Role |
| task | 是 | Task |
| contextLabel | 是 | Context 标签（前端表单 label） |
| contextPlaceholder | 否 | Context 输入提示 |
| constraints | 是 | Constraint 列表 |
| outputFormat | 是 | Output 格式说明 |

---

## 4. System Prompt 组装规则

`PromptTemplateService.buildSystemPrompt(template, context)` 输出：

```text
{role}

{task}

{contextLabel}：
{context}

要求：
- {constraint1}
- {constraint2}

输出：
{outputFormat}
```

`context` 为空时不输出 Context 段落（仅 Role/Task/要求/输出）。

---

## 5. API

### 5.1 获取模板列表

```
GET /ai/prompts
Authorization: Bearer JWT
```

**响应：**

```json
[
  {
    "id": "frontend-interviewer",
    "name": "前端面试官",
    "description": "根据技术栈生成中级面试题（不含答案）",
    "contextLabel": "用户技术栈",
    "contextPlaceholder": "React、Vue、TypeScript"
  }
]
```

不返回 role/task/constraints 等组装细节（由后端在 stream 时使用）。

### 5.2 流式发送（扩展）

```
GET /conversations/:id/stream?content={context}&promptId={id}&token={jwt}
```

| 参数 | 必填 | 说明 |
|------|------|------|
| content | 是 | 用户填写的 Context 内容 |
| promptId | 否 | 模板 id；**仅首条用户消息**时生效 |

**首条消息 + promptId：**

1. 校验模板存在，否则 `400 Bad Request`
2. 写入 `conversation.promptTemplateId = promptId`
3. 用户消息存库：`【{template.name}】{content}`
4. `ContextBuilder` 注入 system prompt

**后续消息：**

- 忽略 `promptId` 参数
- 若会话已有 `promptTemplateId`，继续注入同一 system prompt（Context 取首条用户消息中 `】` 后的内容，或存首条 context 于内存逻辑——见实现计划）

**首条消息无 promptId：** 行为与现有一致，普通聊天。

**非首条消息传 promptId：** 忽略，不报错。

---

## 6. 数据模型

```prisma
model Conversation {
  id                   Int       @id @default(autoincrement())
  userId               Int
  title                String    @db.VarChar(100)
  summary              String?   @db.Text
  summarizedMessageId  Int?
  promptTemplateId     String?   @db.VarChar(50)  // 新增
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  messages             Message[]

  @@index([userId, updatedAt])
}
```

---

## 7. ContextBuilder 变更

在 `build(conversation, dbMessages)` 中：

1. 若 `conversation.promptTemplateId` 存在：
   - 加载模板
   - 从首条 `role=user` 消息解析 Context（格式 `【模板名】context`）
   - 在 messages 数组**最前**插入 `{ role: 'system', content: buildSystemPrompt(...) }`
2. 若同时存在摘要 system（消息数 > SUMMARY_TRIGGER），顺序为：
   - `[system: prompt模板]`
   - `[system: 历史对话摘要]`（现有逻辑）
   - `[recent user/assistant messages]`

---

## 8. 前端交互

### 8.1 数据流

1. 页面加载 → `GET /ai/prompts` 获取模板列表
2. 空会话 welcome 区展示：现有快捷建议 + Prompt 模板按钮
3. 点击模板 → 设置 `selectedPrompt`，composer 上方显示 Context 输入区
4. 发送 → `streamChat(conversationId, context, { promptId })`
5. 可取消模板选择，恢复普通输入

### 8.2 UI 要点

- 模板按钮样式与 `chat-suggestion-btn` 一致或子类区分
- 选中模板后 composer placeholder 变为「填写{contextLabel}…」
- 显示标签：`当前模板：前端面试官 ×`
- 有消息历史后不再展示模板选择（或 composer 仍可切换——**本期：有消息后隐藏模板区，仅首条可用**）

### 8.3 新增文件

| 文件 | 职责 |
|------|------|
| `admin-web/services/prompt.ts` | `getPromptTemplates()` |
| `admin-web/components/chat/PromptTemplatePicker.tsx` | 模板选择与 Context 输入 UI |

### 8.4 修改文件

| 文件 | 变更 |
|------|------|
| `admin-web/services/ai.ts` | `streamChat` 增加可选 `promptId` query |
| `admin-web/app/chat/page.tsx` | 集成模板选择、发送逻辑 |

---

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| promptId 不存在 | 400，`模板不存在` |
| 首条消息 content 为空 | 400，与现有一致 |
| 模板 JSON 格式错误 | 启动时日志报错，跳过该文件 |
| 会话已有 promptTemplateId，再传不同 promptId | 忽略新 promptId |

---

## 10. 测试要点

**后端：**

- `PromptTemplateService.buildSystemPrompt` 单元测试
- Context 解析 `【前端面试官】React, Vue` 单元测试

**手动：**

1. 选「前端面试官」，填 `React、Vue、TypeScript`，发送
2. 确认回复为 Markdown 面试题且无答案
3. 追问「再来 3 道 Vue 题」，确认仍保持面试官角色
4. 新建普通会话（不选模板），行为不变

---

## 11. 文件结构预览

### 后端新建

| 文件 | 职责 |
|------|------|
| `study-nest-js/src/ai/prompts/frontend-interviewer.json` | 示例模板 |
| `study-nest-js/src/ai/types/prompt-template.type.ts` | 类型定义 |
| `study-nest-js/src/ai/prompt-template.service.ts` | 读取与组装 |
| `study-nest-js/src/ai/prompt-template.service.spec.ts` | 单元测试 |

### 后端修改

| 文件 | 变更 |
|------|------|
| `study-nest-js/prisma/schema.prisma` | 新增 `promptTemplateId` |
| `study-nest-js/src/ai/ai.module.ts` | 注册 PromptTemplateService |
| `study-nest-js/src/ai/ai.controller.ts` | `GET /ai/prompts` |
| `study-nest-js/src/conversation/conversation.module.ts` | 导入 AiModule 或 export PromptTemplateService |
| `study-nest-js/src/conversation/conversation.controller.ts` | stream 接受 promptId |
| `study-nest-js/src/conversation/conversation.service.ts` | 绑定 promptTemplateId |
| `study-nest-js/src/conversation/context-builder.service.ts` | 注入模板 system |
