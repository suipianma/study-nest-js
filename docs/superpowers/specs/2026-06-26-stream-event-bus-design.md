# Stream Event Bus 设计（前端）

## 目标

将 `SSE → StreamHandlers → page.tsx` 单体管道升级为 `Stream → Event Bus → Multiple Consumers`，为埋点、Tool Panel、Debug Panel 预留扩展点。

**范围：** 仅 `admin-web`；后端 `ConversationStreamService.emitLive` 保持现状。

## 现状问题

- `createStreamHandlers`（~150 行）混杂 message / tool / agent / lifecycle
- viewing 与 background 分支逻辑重复
- 新增横切关注点只能继续堆 callback

## 目标架构

```
SSE → StreamAdapter → createStreamBusHandlers → StreamEventBus.emit
                                                      │
                    ┌─────────────┬───────────┬───────┴────────┐
                    ▼             ▼           ▼                ▼
            MessageStore    ToolUi    AgentTimeline   Lifecycle
            Consumer        Consumer  Consumer        Consumer
                    │             │           │                │
                    └─────────────┴───────────┴────────────────┘
                                          │
                              Analytics / DebugLog (stub)
```

## 事件模型

| type | 说明 |
|------|------|
| `message_delta` | 思考/正文增量 |
| `tool_call` | 工具调用开始 |
| `tool_result` | 工具返回 |
| `agent_step` | Agent 阶段事件 |
| `stream_meta` | streamId / seq |
| `stream_done` | 流结束 |
| `stream_error` | 流错误（含可选 rollback） |

## 不变量

- 切换会话 ≠ 停止生成；后台 draft 继续收事件
- 仅当前会话生成中禁用输入
- `AIClient` 重试/熔断/续传逻辑不变

## 文件结构

```
admin-web/lib/stream/
  stream-event.ts
  stream-event-bus.ts
  stream-bus-handlers.ts
  consumers/
    message-store.consumer.ts
    tool-ui.consumer.ts
    agent-timeline.consumer.ts
    stream-lifecycle.consumer.ts
    analytics.consumer.ts
    debug-log.consumer.ts
    types.ts
    dispatch.ts
    index.ts
  index.ts
hooks/useChatStreamBus.ts
```
