# AI Function Calling（Prompt JSON 方案）设计规格

**日期：** 2026-06-17  
**状态：** 已批准  
**范围：** study-nest-js（后端）+ admin-web（聊天页展示）  
**对齐：** `AI学习扩展.md` Function Calling 章节

---

## 1. 背景与目标

当前聊天链路为「用户 → Ollama → 流式回复 → 落库」，模型只能基于训练数据回答，无法查询实时信息（如天气）。

**目标：** 实现 Prompt 约定 JSON 的 Function Calling：

```
用户：武汉天气
  ↓
模型：{"tool":"weather","city":"武汉"}
  ↓
NestJS：weather({ city: "武汉" }) → "武汉 31℃，晴"
  ↓
模型（第二轮）：根据工具结果生成自然语言回复
  ↓
用户看到：工具调用过程 + 最终回答
```

**本期做：**

- 可扩展的工具注册表（Tool Registry）
- JSON 解析与工具执行编排（Tool Orchestrator）
- 第一个工具：`weather`（默认 mock，可选真实 API）
- SSE 推送工具调用阶段事件
- 前端展示「工具调用 / 工具结果」卡片

**本期不做：**

- Ollama 原生 `tools` API（方案 B）
- 管理后台配置工具
- 多工具链式调用（一次只执行一轮工具）
- 工具调用历史落库（仅最终 assistant 正文入库）

---

## 2. 方案 A 的三种实现变体

| 变体 | 流程 | 优点 | 缺点 |
|------|------|------|------|
| **A1 推荐** | 第一轮非流式判工具 → 执行 → 第二轮流式回答 | 实现简单；用户不会看到流式 JSON 碎片 | 工具判定阶段无逐字输出 |
| A2 | 全程单流式，结束后解析 JSON 再二轮流式 | 与现有 stream 接口接近 | 首轮流式可能先露出 JSON，体验差 |
| A3 | 首轮流式 + 前端隐藏 JSON，检测后切二轮 | 可展示「思考中」 | 解析时机复杂，易误判 |

**采用 A1**：第一轮 `chat()` 非流式拿完整 JSON，第二轮 `streamChat()` 输出最终回答。符合学习笔记原理，工程上最稳。

---

## 3. 架构与模块

```
admin-web (SSE 消费)
    ↑ tool_call / tool_result / contentDelta
conversation.controller.prepareStream
    ↓
ToolOrchestratorService.streamWithTools(messages)
    ├─ ToolPromptService      → 注入工具 system prompt
    ├─ AiService.chat()       → 第一轮（判工具）
    ├─ ToolCallParserService  → 解析 JSON
    ├─ ToolRegistryService    → 执行 weather()
    └─ AiService.streamChat() → 第二轮（最终回答）
```

**新增文件：**

| 路径 | 职责 |
|------|------|
| `src/ai/tools/types/tool.type.ts` | 工具定义、调用请求、执行结果类型 |
| `src/ai/tools/tool-registry.service.ts` | 注册表 + `execute(name, args)` |
| `src/ai/tools/tool-call-parser.service.ts` | 从模型输出提取 JSON |
| `src/ai/tools/tool-prompt.service.ts` | 生成工具 system prompt |
| `src/ai/tools/tool-orchestrator.service.ts` | 两轮编排，输出 Observable |
| `src/ai/tools/implementations/weather.tool.ts` | 天气工具 |
| `src/ai/tools/tool-call-parser.service.spec.ts` | 解析单测 |

**修改文件：**

| 路径 | 改动 |
|------|------|
| `src/ai/ai.module.ts` | 注册新 providers |
| `src/conversation/conversation.controller.ts` | `prepareStream` 走 orchestrator |
| `admin-web/services/ai.ts` | 解析 `tool_call` / `tool_result` SSE |
| `admin-web/components/chat/ToolCallBlock.tsx` | 工具调用 UI |
| `admin-web/components/chat/ChatMessageItem.tsx` | 嵌入 ToolCallBlock |
| `admin-web/hooks/useChatMessages.ts` | 流式临时字段 `toolCalls` |

---

## 4. 工具 JSON 协议

与笔记示例一致，**扁平参数**（`tool` 以外字段均为参数）：

```json
{"tool":"weather","city":"武汉"}
```

解析规则：

1. 去掉 `...` 后取正文
2. 尝试 `JSON.parse` 全文；失败则尝试提取第一个 `{...}` 块
3. 必须包含 `tool: string`，且值在注册表中
4. 解析失败 → **视为普通文本回复**，不执行工具，直接展示

第二轮发给模型的 messages 追加：

```typescript
{ role: 'assistant', content: '{"tool":"weather","city":"武汉"}' }
{ role: 'user', content: '工具 weather 返回结果：武汉 31℃，晴。请根据该结果用自然语言回答用户。' }
```

---

## 5. 工具 System Prompt

`ToolPromptService.build()` 在**第一轮** messages 最前注入（不写入 DB）：

```text
你是一个智能助手。当用户问题需要查询实时外部信息时，你必须只输出一个 JSON 对象，不要输出任何其他文字或 Markdown。

可用工具：
1. weather — 查询城市天气
   参数：city (string，城市名，如「武汉」)

输出格式（仅 JSON，无代码块）：
{"tool":"weather","city":"武汉"}

如果不需要调用工具，直接用自然语言回答用户，不要输出 JSON。
```

**与 Prompt 模板共存：** 工具 system 置于最前；模板 system 紧随其后；二者可同时生效。

---

## 6. weather 工具

| 项 | 说明 |
|----|------|
| 名称 | `weather` |
| 参数 | `city: string`（必填） |
| 默认 | Mock：`{city} 26℃，多云（模拟数据）` |
| 可选 | 环境变量 `WEATHER_API_KEY` 存在时调 OpenWeatherMap（或同类免费 API） |

Mock 足够完成学习与演示；真实 API 作为加分项，不阻塞首期。

---

## 7. SSE 事件协议（扩展）

在现有 `thinkingDelta` / `contentDelta` / `done` 基础上新增：

```typescript
// 检测到工具调用
{ phase: 'tool_call', tool: 'weather', args: { city: '武汉' } }

// 工具执行完成
{ phase: 'tool_result', tool: 'weather', result: '武汉 26℃，多云（模拟数据）' }

// 第二轮流式（与现有一致）
{ contentDelta: '...', thinkingDelta: '...' }

// 结束
{ done: true, thinking: '', response: '武汉今天多云...' }
```

**持久化：** 仅保存第二轮最终 `thinking` + `response`；工具阶段不落库（YAGNI）。

**缓存：** 含工具 system 的请求不走 `AiCacheService`（结果随工具变）。

---

## 8. 前端交互

流式 assistant 消息临时结构：

```typescript
interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolCalls?: Array<{
    tool: string;
    args: Record<string, string>;
    result?: string;
    status: 'calling' | 'done' | 'error';
  }>;
}
```

UI 顺序（assistant 气泡内）：

1. **工具调用卡片**（有 `toolCalls` 时）— 显示工具名、参数、结果
2. **思考过程**（有 thinking 时）
3. **回答**（content 流式）

示例展示：

```
🔧 调用工具 weather
   参数：city = 武汉
   结果：武汉 26℃，多云（模拟数据）

💬 回答
   武汉今天多云，气温约 26℃...
```

---

## 9. 错误处理

| 场景 | 行为 |
|------|------|
| JSON 解析失败 | 第一轮输出当普通回复，不触发工具 |
| 未知工具名 | SSE `tool_result` 带 error；第二轮让模型告知无法完成 |
| 工具执行异常 | 同上，错误信息传给第二轮 |
| 第二轮流中断 | 沿用现有 `[回复中断]` 逻辑 |
| 缺少 city | weather 返回参数错误，交给第二轮模型说明 |

---

## 10. 测试计划

| 测试 | 内容 |
|------|------|
| `tool-call-parser.service.spec.ts` | 纯 JSON、带 think 标签、代码块包裹、非 JSON 文本 |
| `tool-registry.service.spec.ts` | 注册、执行、未知工具抛错 |
| `weather.tool.spec.ts` | mock 返回含 city |
| 手动 E2E | 输入「武汉天气」→ 见工具卡片 → 见自然语言回答 |

---

## 11. 配置项

```env
# .env.dev 新增（可选）
WEATHER_API_KEY=          # 留空则用 mock
OLLAMA_MODEL=qwen3:8b     # 推荐，JSON 输出比 deepseek-r1:1.5b 稳定
```

---

## 12. 验收标准

- [ ] 用户发送「武汉天气」，后端解析出 `weather` + `city:武汉`
- [ ] 前端展示工具调用卡片（含参数与结果）
- [ ] 最终回复为基于工具结果的自然语言，而非裸 JSON
- [ ] 普通对话（如「你好」）不触发工具，行为与现有一致
- [ ] 单元测试通过

---

## 13. 后续扩展（不在本期）

- 注册更多工具（计算器、数据库查询）
- 工具调用记录落库
- 切换 Ollama 原生 tools API（方案 B）
- 多轮工具链（Agent 循环）
