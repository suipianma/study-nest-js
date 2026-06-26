# AI Function Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为聊天增加 Prompt JSON 方案 Function Calling（weather 工具 + 前端工具卡片）

**Architecture:** ToolOrchestrator 第一轮非流式判工具 → 执行 registry → 第二轮流式回答；SSE 推送 tool_call/tool_result

**Tech Stack:** NestJS + Ollama + Next.js EventSource

**Spec:** `docs/superpowers/specs/2026-06-17-ai-function-calling-design.md`

---

## 实现状态：已完成

- [x] 后端工具模块（parser / registry / prompt / orchestrator / weather）
- [x] conversation.controller 接入 orchestrator
- [x] AiService skipCache 支持
- [x] 前端 SSE + ToolCallBlock + 聊天页 wiring
- [x] 单元测试 7/7 通过
- [x] 前后端 build 通过
