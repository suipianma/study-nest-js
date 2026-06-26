# AI Orchestrator 实现计划

> **Goal:** 统一调度 Input → Context → Prompt → RAG → Tool → Stream，并接入完整 Agent 栈。

**Architecture:** `AiOrchestratorService` 顺序执行 6 个 Stage；`ConversationController` 仅调 orchestrator；Stream 按 `direct` / `agent` 分支。

**Tech Stack:** NestJS 11, Ollama, MCP SDK, Next.js admin-web

---

## 已完成（2026-06-26）

- [x] `ContextEngine`: `skipPrompt` / `skipRag` / `enrichPlan` / `buildPromptBlock` / `buildRagBlocks`
- [x] `ai/orchestrator/` 六 Stage + `AiOrchestratorService` + Module
- [x] `ConversationController` 瘦身，接入 orchestrator
- [x] `AiModule`: AgentRouter, AgentOrchestrator, MCP, searchKnowledgeBase 工具
- [x] `ConversationStreamService`: direct=`AiService.streamChat`, agent=`AgentOrchestrator`
- [x] 前端: Agent SSE + `AgentStepBlock` 接线

## 待办

- [x] Orchestrator 单测 / ToolStage / parseKnowledgeBaseIds
- [x] ContextEngine skipPrompt/skipRag/enrichPlan 单测
- [x] 删除 `context-builder.service.ts` 死代码
- [x] `ToolOrchestratorService` 标记 @deprecated
- [ ] E2E：MCP filesystem + 知识库 Agent 工具验证
