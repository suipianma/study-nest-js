# AI Prompt 模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 聊天增加后端 JSON Prompt 模板与前端预设选择，首条消息绑定模板并以 system message 注入 Ollama。

**Architecture:** `PromptTemplateService` 读取 `src/ai/prompts/*.json` 并组装 system prompt；会话表存 `promptTemplateId`；`ContextBuilder` 在摘要 system 之前注入模板 system；前端聊天页空会话展示模板 picker。

**Tech Stack:** NestJS 11, Prisma 6, Jest, Next.js 16, Ant Design 6, EventSource SSE

**Spec:** `docs/superpowers/specs/2026-06-17-ai-prompt-templates-design.md`

---

## 文件结构预览

| 文件 | 操作 | 职责 |
|------|------|------|
| `study-nest-js/src/ai/prompts/frontend-interviewer.json` | 新建 | 示例模板 |
| `study-nest-js/src/ai/types/prompt-template.type.ts` | 新建 | 模板类型 |
| `study-nest-js/src/ai/prompt-template.service.ts` | 新建 | 加载 + 组装 + 解析 Context |
| `study-nest-js/src/ai/prompt-template.service.spec.ts` | 新建 | 单元测试 |
| `study-nest-js/prisma/schema.prisma` | 修改 | `promptTemplateId` 字段 |
| `study-nest-js/src/ai/ai.module.ts` | 修改 | 注册并 export service |
| `study-nest-js/src/ai/ai.controller.ts` | 修改 | `GET /ai/prompts` |
| `study-nest-js/src/conversation/conversation.service.ts` | 修改 | 绑定模板、格式化用户消息 |
| `study-nest-js/src/conversation/conversation.controller.ts` | 修改 | stream 接收 `promptId` |
| `study-nest-js/src/conversation/context-builder.service.ts` | 修改 | 注入模板 system |
| `study-nest-js/src/conversation/conversation.module.ts` | 修改 | 注入 PromptTemplateService |
| `admin-web/services/prompt.ts` | 新建 | 模板列表 API |
| `admin-web/services/ai.ts` | 修改 | stream 传 promptId |
| `admin-web/components/chat/PromptTemplatePicker.tsx` | 新建 | 模板 UI |
| `admin-web/app/chat/page.tsx` | 修改 | 集成 picker |

---

### Task 1: 模板类型与 JSON 文件

**Files:**
- Create: `study-nest-js/src/ai/types/prompt-template.type.ts`
- Create: `study-nest-js/src/ai/prompts/frontend-interviewer.json`

- [ ] **Step 1: 创建类型文件**

```typescript
// study-nest-js/src/ai/types/prompt-template.type.ts
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  role: string;
  task: string;
  contextLabel: string;
  contextPlaceholder?: string;
  constraints: string[];
  outputFormat: string;
}

export interface PromptTemplateListItem {
  id: string;
  name: string;
  description: string;
  contextLabel: string;
  contextPlaceholder?: string;
}
```

- [ ] **Step 2: 创建示例模板 JSON**

内容同 spec 第 3 节 `frontend-interviewer.json`。

---

### Task 2: PromptTemplateService + 单元测试

**Files:**
- Create: `study-nest-js/src/ai/prompt-template.service.ts`
- Create: `study-nest-js/src/ai/prompt-template.service.spec.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// prompt-template.service.spec.ts
import { PromptTemplateService } from './prompt-template.service';
import { PromptTemplate } from './types/prompt-template.type';

describe('PromptTemplateService', () => {
  let service: PromptTemplateService;

  beforeEach(() => {
    service = new PromptTemplateService();
  });

  it('buildSystemPrompt 应组装 Role/Task/Context/Constraint/Output', () => {
    const template: PromptTemplate = {
      id: 'frontend-interviewer',
      name: '前端面试官',
      description: 'test',
      role: '你是一名资深前端面试官',
      task: '请根据用户技术栈生成面试题',
      contextLabel: '用户技术栈',
      constraints: ['难度中级', '不要给答案'],
      outputFormat: 'Markdown格式',
    };

    const result = service.buildSystemPrompt(
      template,
      'React、Vue、TypeScript',
    );

    expect(result).toContain('你是一名资深前端面试官');
    expect(result).toContain('请根据用户技术栈生成面试题');
    expect(result).toContain('React、Vue、TypeScript');
    expect(result).toContain('- 难度中级');
    expect(result).toContain('Markdown格式');
  });

  it('parseContextFromUserMessage 应从【名称】后解析 context', () => {
    expect(
      service.parseContextFromUserMessage('【前端面试官】React, Vue'),
    ).toBe('React, Vue');
    expect(service.parseContextFromUserMessage('普通消息')).toBe('');
  });

  it('formatUserMessage 应加模板前缀', () => {
    expect(
      service.formatUserMessage(
        { name: '前端面试官' } as PromptTemplate,
        'React',
      ),
    ).toBe('【前端面试官】React');
  });
});
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `cd study-nest-js && pnpm test -- prompt-template.service.spec.ts`
Expected: FAIL — `PromptTemplateService` not found

- [ ] **Step 3: 实现 PromptTemplateService**

```typescript
// study-nest-js/src/ai/prompt-template.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  PromptTemplate,
  PromptTemplateListItem,
} from './types/prompt-template.type';

@Injectable()
export class PromptTemplateService implements OnModuleInit {
  private readonly logger = new Logger(PromptTemplateService.name);
  private readonly templates = new Map<string, PromptTemplate>();
  private readonly promptsDir = join(__dirname, 'prompts');

  onModuleInit(): void {
    this.loadTemplates();
  }

  findAll(): PromptTemplateListItem[] {
    return [...this.templates.values()].map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      contextLabel: t.contextLabel,
      contextPlaceholder: t.contextPlaceholder,
    }));
  }

  findById(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  buildSystemPrompt(template: PromptTemplate, context: string): string {
    const lines: string[] = [template.role, '', template.task, ''];

    const trimmedContext = context.trim();
    if (trimmedContext) {
      lines.push(`${template.contextLabel}：`, trimmedContext, '');
    }

    lines.push('要求：');
    template.constraints.forEach((c) => lines.push(`- ${c}`));
    lines.push('', '输出：', template.outputFormat);

    return lines.join('\n');
  }

  formatUserMessage(template: PromptTemplate, context: string): string {
    return `【${template.name}】${context.trim()}`;
  }

  /** 从首条用户消息解析 Context（【模板名】后的内容） */
  parseContextFromUserMessage(content: string): string {
    const match = /^【[^】]+】([\s\S]*)$/.exec(content.trim());
    return match?.[1]?.trim() ?? '';
  }

  private loadTemplates(): void {
    let files: string[];
    try {
      files = readdirSync(this.promptsDir).filter((f) => f.endsWith('.json'));
    } catch (err) {
      this.logger.warn(`Prompt 目录不存在: ${this.promptsDir}`, err);
      return;
    }

    for (const file of files) {
      try {
        const raw = readFileSync(join(this.promptsDir, file), 'utf-8');
        const template = JSON.parse(raw) as PromptTemplate;
        if (!template.id) {
          this.logger.warn(`跳过无效模板 ${file}: 缺少 id`);
          continue;
        }
        this.templates.set(template.id, template);
      } catch (err) {
        this.logger.warn(`跳过无效模板 ${file}`, err);
      }
    }

    this.logger.log(`已加载 ${this.templates.size} 个 Prompt 模板`);
  }
}
```

- [ ] **Step 4: 运行测试确认 PASS**

Run: `cd study-nest-js && pnpm test -- prompt-template.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 注册到 AiModule**

```typescript
// ai.module.ts — providers 增加 PromptTemplateService，exports 增加 PromptTemplateService
import { PromptTemplateService } from './prompt-template.service';

@Module({
  imports: [RedisModule],
  providers: [AiService, AiCacheService, OllamaProvider, PromptTemplateService],
  controllers: [AiController],
  exports: [AiService, PromptTemplateService],
})
export class AiModule {}
```

---

### Task 3: GET /ai/prompts API

**Files:**
- Modify: `study-nest-js/src/ai/ai.controller.ts`

- [ ] **Step 1: 添加列表接口**

```typescript
import { Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromptTemplateService } from './prompt-template.service';

@ApiTags('AI模块')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly promptTemplateService: PromptTemplateService,
  ) {}

  @Get('prompts')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '获取 Prompt 模板列表' })
  listPrompts() {
    return this.promptTemplateService.findAll();
  }

  // ...existing POST chat
}
```

- [ ] **Step 2: 手动验证**

Run: 后端 `start:dev` 后 `GET http://localhost:3000/ai/prompts`（带 JWT）
Expected: 返回含 `frontend-interviewer` 的数组

---

### Task 4: Prisma 迁移

**Files:**
- Modify: `study-nest-js/prisma/schema.prisma`

- [ ] **Step 1: 添加字段**

```prisma
promptTemplateId  String?  @db.VarChar(50)
```

加到 `Conversation` model。

- [ ] **Step 2: 执行迁移**

Run:
```powershell
cd study-nest-js
pnpm run prisma:migrate:dev -- --name add_prompt_template_id
pnpm run prisma:generate
```

Expected: migration 成功

---

### Task 5: ConversationService 绑定模板

**Files:**
- Modify: `study-nest-js/src/conversation/conversation.service.ts`

- [ ] **Step 1: 新增 bindPromptTemplate 方法**

```typescript
async bindPromptTemplate(
  conversationId: number,
  promptTemplateId: string,
): Promise<void> {
  await this.prisma.conversation.update({
    where: { id: conversationId },
    data: { promptTemplateId },
  });
}
```

- [ ] **Step 2: createUserMessage 保持不变**（格式化在 controller 层完成）

---

### Task 6: ContextBuilder 注入模板 system

**Files:**
- Modify: `study-nest-js/src/conversation/context-builder.service.ts`
- Modify: `study-nest-js/src/conversation/conversation.module.ts`

- [ ] **Step 1: ConversationModule 确保 AiModule 已 import**（已有则跳过）

- [ ] **Step 2: 注入 PromptTemplateService 并修改 build**

```typescript
// context-builder.service.ts
constructor(private readonly promptTemplateService: PromptTemplateService) {}

build(conversation: Conversation, dbMessages: Message[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  // 模板 system（在摘要 system 之前）
  if (conversation.promptTemplateId) {
    const template = this.promptTemplateService.findById(
      conversation.promptTemplateId,
    );
    const firstUser = dbMessages.find((m) => m.role === 'user');
    if (template && firstUser) {
      const context = this.promptTemplateService.parseContextFromUserMessage(
        firstUser.content,
      );
      result.push({
        role: 'system',
        content: this.promptTemplateService.buildSystemPrompt(template, context),
      });
    }
  }

  if (dbMessages.length <= SUMMARY_TRIGGER) {
    dbMessages.forEach((m) => result.push(this.toChatMessage(m)));
    return result;
  }

  // ...existing 摘要逻辑，push 摘要 system 到 result，再 push recent
}
```

---

### Task 7: Stream 接口支持 promptId

**Files:**
- Modify: `study-nest-js/src/conversation/conversation.controller.ts`
- Modify: `study-nest-js/src/conversation/conversation.module.ts`

- [ ] **Step 1: stream 增加 Query promptId**

```typescript
stream(
  @Param('id') id: string,
  @Query('content') content: string,
  @Query('promptId') promptId: string | undefined,
  @Req() req: Request & { user: JwtPayload },
)
```

- [ ] **Step 2: prepareStream 首条消息处理**

在 `createUserMessage` 之前：

```typescript
const userCountBefore = messagesBefore.filter((m) => m.role === 'user').length;
let messageContent = content;

if (userCountBefore === 0 && promptId?.trim()) {
  const template = this.promptTemplateService.findById(promptId.trim());
  if (!template) {
    throw new BadRequestException('模板不存在');
  }
  await this.conversationService.bindPromptTemplate(conversationId, template.id);
  messageContent = this.promptTemplateService.formatUserMessage(template, content);
}

await this.conversationService.createUserMessage(conversationId, messageContent);
```

- [ ] **Step 3: 注入 PromptTemplateService 到 ConversationController 构造函数**

---

### Task 8: 前端 API 与 stream 参数

**Files:**
- Create: `admin-web/services/prompt.ts`
- Modify: `admin-web/services/ai.ts`

- [ ] **Step 1: 创建 prompt.ts**

```typescript
import request from "@/utils/request";

export interface PromptTemplateItem {
  id: string;
  name: string;
  description: string;
  contextLabel: string;
  contextPlaceholder?: string;
}

export function getPromptTemplates() {
  return request.get<PromptTemplateItem[]>("/ai/prompts");
}
```

- [ ] **Step 2: streamChat 增加 promptId**

```typescript
export function streamChat(
  conversationId: number,
  content: string,
  { onUpdate, onDone, onError, promptId }: StreamChatOptions & { promptId?: string }
): () => void {
  const params = new URLSearchParams({ content });
  if (promptId) params.set("promptId", promptId);
  // ...rest unchanged
}
```

---

### Task 9: PromptTemplatePicker 组件

**Files:**
- Create: `admin-web/components/chat/PromptTemplatePicker.tsx`

- [ ] **Step 1: 实现组件**

```tsx
"use client";

import { CloseOutlined } from "@ant-design/icons";
import type { PromptTemplateItem } from "@/services/prompt";

interface Props {
  templates: PromptTemplateItem[];
  selected: PromptTemplateItem | null;
  disabled?: boolean;
  onSelect: (template: PromptTemplateItem) => void;
  onClear: () => void;
}

export default function PromptTemplatePicker({
  templates,
  selected,
  disabled,
  onSelect,
  onClear,
}: Props) {
  if (templates.length === 0) return null;

  return (
    <div className="chat-prompt-templates">
      <p className="chat-prompt-templates-label">Prompt 模板</p>
      <div className="chat-welcome-list">
        {templates.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chat-suggestion-btn${
              selected?.id === item.id ? " chat-suggestion-btn--active" : ""
            }`}
            disabled={disabled}
            onClick={() => onSelect(item)}
          >
            <span className="chat-suggestion-text">{item.name}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="chat-prompt-selected">
          <span>当前模板：{selected.name}</span>
          <button type="button" className="chat-prompt-clear" onClick={onClear}>
            <CloseOutlined />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 在 `globals.css` 或现有 chat 样式中补充 `.chat-prompt-templates`、`.chat-suggestion-btn--active` 最小样式**

---

### Task 10: 聊天页集成

**Files:**
- Modify: `admin-web/app/chat/page.tsx`

- [ ] **Step 1: 加载模板列表**

```typescript
import { getPromptTemplates, type PromptTemplateItem } from "@/services/prompt";
import PromptTemplatePicker from "@/components/chat/PromptTemplatePicker";

const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>([]);
const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplateItem | null>(null);

useEffect(() => {
  getPromptTemplates()
    .then((res) => setPromptTemplates(res.data))
    .catch(() => {});
}, []);
```

- [ ] **Step 2: welcome 区加入 PromptTemplatePicker**（`messages.length === 0` 时）

- [ ] **Step 3: 修改 handleSend**

```typescript
function handleSend(text?: string) {
  const content = (text ?? input).trim();
  // ...
  const promptId =
    messages.length === 0 && selectedPrompt ? selectedPrompt.id : undefined;

  stopStreamRef.current = streamChat(activeConversationId, content, {
    promptId,
    onUpdate: (reply) => pushStream(reply),
    // ...
  });

  setSelectedPrompt(null);
}
```

- [ ] **Step 4: textarea placeholder 随 selectedPrompt 变化**

```typescript
placeholder={
  selectedPrompt
    ? `填写${selectedPrompt.contextLabel}，Enter 发送`
    : streaming ? "..." : "输入消息..."
}
```

- [ ] **Step 5: 切换会话时清空 selectedPrompt**

在 `handleSelectConversation` 和 `handleCreateConversation` 中 `setSelectedPrompt(null)`。

---

### Task 11: 端到端验证

- [ ] **Step 1: 启动 infra + 后端 + 前端**

- [ ] **Step 2: 手动测试清单**

1. 空会话 → 看到「前端面试官」模板
2. 选模板 → 填 `React、Vue、TypeScript` → 发送
3. 回复为 Markdown 面试题，无标准答案
4. 追问第二句 → 仍保持面试官角色
5. 不选模板普通聊天 → 行为不变
6. 传无效 promptId → 400 错误提示

Run backend tests: `cd study-nest-js && pnpm test -- prompt-template.service.spec.ts`
Expected: PASS

---

## Spec 覆盖自检

| Spec 要求 | 对应 Task |
|-----------|-----------|
| JSON 模板文件 | Task 1 |
| buildSystemPrompt | Task 2 |
| GET /ai/prompts | Task 3 |
| promptTemplateId 字段 | Task 4 |
| stream promptId | Task 7 |
| ContextBuilder 注入 | Task 6 |
| 前端 picker | Task 9-10 |
| 单元测试 | Task 2 |
| 手动 E2E | Task 11 |
