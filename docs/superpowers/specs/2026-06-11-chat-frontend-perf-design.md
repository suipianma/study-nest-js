# 聊天页前端性能优化 设计规格

**日期：** 2026-06-12  
**状态：** 已批准  
**默认分页：** limit=30

## 分期

1. **一期**：分页 API + 前端以 DB 为准同步
2. **二期**：react-virtuoso 虚拟列表 + ChatMessageItem memo
3. **三期**：SSE 批量更新 + Markdown 延迟解析 + 自动滚动节流

## 分页 API

`GET /conversations/:id/messages?limit=30&beforeId=123`

响应：`{ items: Message[], hasMore: boolean, total: number }`

- 无 beforeId：取最新 limit 条（时间升序返回）
- 有 beforeId：取该 id 之前（更早）的 limit 条

## 虚拟列表

`react-virtuoso`，`startReached` 加载更早消息，`followOutput` 跟随新消息。

## SSE

50ms 批量 flush onUpdate。

## Markdown

流式中纯文本；历史/完成后 IntersectionObserver 触发解析。

## 滚动

距底部 80px 内才自动滚；throttle 100ms。
