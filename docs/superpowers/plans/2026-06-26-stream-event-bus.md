# Stream Event Bus Implementation Plan

> **Goal:** 前端 SSE 流式事件经 Event Bus 分发给多消费者，解耦 page.tsx。

**Architecture:** `StreamAdapter → createStreamBusHandlers → StreamEventBus → dispatchStreamEvent → consumers`

**Tech Stack:** Next.js 16, TypeScript, 现有 `lib/ai/StreamAdapter`

---

- [x] `lib/stream/stream-event.ts` — 事件联合类型
- [x] `lib/stream/stream-event-bus.ts` — subscribe/emit
- [x] `lib/stream/stream-bus-handlers.ts` — Adapter 桥接
- [x] `lib/stream/consumers/*` — 五类消费者 + dispatch
- [x] `hooks/useChatStreamBus.ts` — 页面订阅生命周期
- [x] `app/chat/page.tsx` — 移除 createStreamHandlers，接入 Bus
- [x] `npm run build` 验证
