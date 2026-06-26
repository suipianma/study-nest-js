# 前端 AI 工程化设计

## 目标

为聊天页建立可维护的请求层与性能基线：抽象、重试/熔断/限流、虚拟列表与懒渲染。

## 1. 请求层 (`admin-web/lib/ai/`)

| 模块 | 职责 |
|------|------|
| `AIClient` | 对外入口，`streamChat` 编排队列/熔断/重试 |
| `StreamAdapter` | EventSource SSE 帧解析，与业务解耦 |
| `RetryPolicy` | 指数退避 + 抖动 |
| `CircuitBreaker` | 连续失败后冷却拒绝 |
| `RequestQueue` | FIFO + 并发上限 |
| `ErrorNormalizer` | 错误分类与 `ApiError` 统一 |

`services/ai.ts` 保留 `streamChat` 兼容导出，内部委托 `aiClient`。

## 2. 重试 / 熔断 / 限流

- **重试**：仅 SSE **连接建立失败**且未收到数据时重试（最多 3 次，指数退避）
- **熔断**：连续 3 次失败后 30s 内拒绝新流
- **并发**：`AI_STREAM_CONCURRENCY=2`，超出排队
- **降级模型**：重试时可选 `NEXT_PUBLIC_AI_FALLBACK_MODEL`（需后端支持 `model` 参数）

## 3. 性能

| 能力 | 状态 |
|------|------|
| 虚拟列表 | `react-virtuoso` + `increaseViewportBy` |
| Message memo | `ChatMessageItem` 自定义 `memo` 比较 |
| Lazy Markdown | `ChatMessageAst` IntersectionObserver |
| Lazy code highlight | `LazyCodeBlock` + `highlight.js` 可见时高亮 |

## 4. 安全

AST 渲染保持白名单；`hljs` 输出仅用于已转义的代码高亮 HTML。
