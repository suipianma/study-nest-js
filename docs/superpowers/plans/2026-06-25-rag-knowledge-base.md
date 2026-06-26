# AI 企业知识库 RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为企业 AI 聊天增加知识库 RAG（上传 PDF/DOCX/TXT/MD、Qdrant 向量检索、权限隔离、聊天引用来源）。

**Architecture:** 新建 `KnowledgeBaseModule` + `EmbeddingModule` + `VectorModule`；入库管线解析→切片→Ollama embed→Qdrant；聊天 stream 前 `RetrievalService` 检索，结果注入 `ContextBuilder`；SSE 推送 `rag_retrieval`。

**Tech Stack:** NestJS 11, Prisma 6, MySQL, Qdrant, Ollama embeddings, pdf-parse, mammoth, Next.js 16, Ant Design 6

**Spec:** `docs/superpowers/specs/2026-06-25-rag-knowledge-base-design.md`

---

## 文件结构预览

### 后端新建

| 文件 | 职责 |
|------|------|
| `study-nest-js/src/embedding/embedding.module.ts` | Embedding 模块 |
| `study-nest-js/src/embedding/embedding.service.ts` | Ollama `/api/embeddings` |
| `study-nest-js/src/embedding/embedding.service.spec.ts` | 单测 |
| `study-nest-js/src/vector/vector.module.ts` | 向量模块 |
| `study-nest-js/src/vector/qdrant.service.ts` | Qdrant CRUD/search |
| `study-nest-js/src/knowledge-base/knowledge-base.module.ts` | 知识库模块 |
| `study-nest-js/src/knowledge-base/knowledge-base.controller.ts` | HTTP API |
| `study-nest-js/src/knowledge-base/knowledge-base.service.ts` | CRUD + 权限 |
| `study-nest-js/src/knowledge-base/knowledge-base.service.spec.ts` | 权限单测 |
| `study-nest-js/src/knowledge-base/ingest.service.ts` | 入库管线 |
| `study-nest-js/src/knowledge-base/retrieval.service.ts` | 检索 + citations |
| `study-nest-js/src/knowledge-base/retrieval.service.spec.ts` | 检索单测 |
| `study-nest-js/src/knowledge-base/chunk.service.ts` | 文本切片 |
| `study-nest-js/src/knowledge-base/chunk.service.spec.ts` | 切片单测 |
| `study-nest-js/src/knowledge-base/constants.ts` | RAG 环境常量 |
| `study-nest-js/src/knowledge-base/types/rag.type.ts` | RagChunk、Citation 类型 |
| `study-nest-js/src/knowledge-base/parsers/parser.interface.ts` | 解析器接口 |
| `study-nest-js/src/knowledge-base/parsers/text.parser.ts` | txt/md |
| `study-nest-js/src/knowledge-base/parsers/pdf.parser.ts` | pdf |
| `study-nest-js/src/knowledge-base/parsers/docx.parser.ts` | docx |
| `study-nest-js/src/knowledge-base/dto/create-knowledge-base.dto.ts` | 创建 DTO |
| `study-nest-js/src/knowledge-base/dto/update-knowledge-base.dto.ts` | 更新 DTO |
| `study-nest-js/src/knowledge-base/dto/search-knowledge-base.dto.ts` | 检索 DTO |

### 后端修改

| 文件 | 变更 |
|------|------|
| `study-nest-js/prisma/schema.prisma` | KnowledgeBase / Document / Chunk |
| `study-nest-js/docker-compose.yml` | 新增 qdrant 服务 |
| `study-nest-js/package.json` | 新依赖 |
| `study-nest-js/src/app.module.ts` | 注册 KnowledgeBaseModule |
| `study-nest-js/src/conversation/conversation.module.ts` | import KnowledgeBaseModule |
| `study-nest-js/src/conversation/context-builder.service.ts` | ragChunks 注入 |
| `study-nest-js/src/conversation/conversation.controller.ts` | knowledgeBaseIds + rag_retrieval SSE |
| `study-nest-js/SETUP.md` | Qdrant + nomic-embed-text 说明 |

### 前端新建/修改

| 文件 | 变更 |
|------|------|
| `admin-web/services/knowledge-base.ts` | 知识库 API |
| `admin-web/app/knowledge-bases/page.tsx` | 列表页 |
| `admin-web/app/knowledge-bases/[id]/page.tsx` | 详情页 |
| `admin-web/components/chat/KnowledgeBasePicker.tsx` | 多选器 |
| `admin-web/components/chat/CitationBlock.tsx` | 引用卡片 |
| `admin-web/components/chat/ChatMessageItem.tsx` | 嵌入 CitationBlock |
| `admin-web/config/nav.ts` | 导航项 |
| `admin-web/services/ai.ts` | knowledgeBaseIds + onRagRetrieval |
| `admin-web/hooks/useChatMessages.ts` | citations 字段 |
| `admin-web/app/chat/page.tsx` | Picker + 传参 |
| `admin-web/app/globals.css` | 知识库/引用样式 |

---

## Task 1: 基础设施与依赖

**Files:**
- Modify: `study-nest-js/docker-compose.yml`
- Modify: `study-nest-js/package.json`
- Modify: `study-nest-js/SETUP.md`

- [ ] **Step 1: docker-compose 新增 Qdrant**

在 `volumes:` 前追加：

```yaml
  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
```

在 `volumes:` 下追加 `qdrant_data:`。

- [ ] **Step 2: 安装后端依赖**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm add @qdrant/js-client-rest pdf-parse mammoth
pnpm add -D @types/pdf-parse
```

- [ ] **Step 3: 启动 infra 并拉取 embedding 模型**

```powershell
pnpm run docker:infra
# 若 docker:infra 仅 mysql redis，改为：
docker compose up -d mysql redis qdrant
ollama pull nomic-embed-text
```

Expected: Qdrant 运行于 `http://localhost:6333`

- [ ] **Step 4: SETUP.md 补充 Qdrant 与 embedding 模型说明**

---

## Task 2: Prisma 数据模型

**Files:**
- Modify: `study-nest-js/prisma/schema.prisma`

- [ ] **Step 1: 追加三个 model**（内容见 spec §5）

- [ ] **Step 2: 执行迁移**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm run prisma:migrate:dev -- --name add_knowledge_base_rag
pnpm run prisma:generate
```

Expected: 迁移成功，Prisma Client 含 KnowledgeBase/Document/Chunk

---

## Task 3: RAG 常量与类型

**Files:**
- Create: `study-nest-js/src/knowledge-base/constants.ts`
- Create: `study-nest-js/src/knowledge-base/types/rag.type.ts`

- [ ] **Step 1: 创建 constants.ts**

```typescript
export const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE ?? 600);
export const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP ?? 100);
export const RAG_TOP_K = Number(process.env.RAG_TOP_K ?? 5);
export const RAG_SCORE_THRESHOLD = Number(process.env.RAG_SCORE_THRESHOLD ?? 0.6);
export const RAG_MAX_FILE_MB = Number(process.env.RAG_MAX_FILE_MB ?? 20);
export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'knowledge_chunks';

export type KnowledgeBaseVisibility = 'private' | 'team' | 'public';
export const KB_VISIBILITY_VALUES: KnowledgeBaseVisibility[] = [
  'private',
  'team',
  'public',
];
```

- [ ] **Step 2: 创建 rag.type.ts**

```typescript
export interface RagChunk {
  chunkId: number;
  documentId: number;
  documentName: string;
  page?: number | null;
  content: string;
  score: number;
}

export interface RagCitation {
  chunkId: number;
  documentName: string;
  page?: number | null;
  snippet: string;
  score: number;
}
```

---

## Task 4: ChunkService（TDD）

**Files:**
- Create: `study-nest-js/src/knowledge-base/chunk.service.spec.ts`
- Create: `study-nest-js/src/knowledge-base/chunk.service.ts`

- [ ] **Step 1: 写 failing test**

```typescript
import { ChunkService } from './chunk.service';

describe('ChunkService', () => {
  const service = new ChunkService();

  it('应按 size/overlap 切片', () => {
    const text = 'a'.repeat(1000);
    const chunks = service.split(text, { size: 400, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(400);
    expect(chunks[1].content.startsWith('a'.repeat(100))).toBe(true);
  });

  it('空文本返回空数组', () => {
    expect(service.split('  ', { size: 400, overlap: 100 })).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

```powershell
pnpm test -- chunk.service.spec
```

- [ ] **Step 3: 实现 ChunkService**

```typescript
import { Injectable } from '@nestjs/common';

export interface ChunkPiece {
  content: string;
  index: number;
}

@Injectable()
export class ChunkService {
  split(
    text: string,
    options: { size: number; overlap: number },
  ): ChunkPiece[] {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const { size, overlap } = options;
    const step = Math.max(1, size - overlap);
    const pieces: ChunkPiece[] = [];
    let index = 0;

    for (let start = 0; start < normalized.length; start += step) {
      const content = normalized.slice(start, start + size).trim();
      if (!content) continue;
      pieces.push({ content, index });
      index += 1;
      if (start + size >= normalized.length) break;
    }

    return pieces;
  }
}
```

- [ ] **Step 4: 运行确认 PASS**

```powershell
pnpm test -- chunk.service.spec
```

---

## Task 5: EmbeddingService（TDD）

**Files:**
- Create: `study-nest-js/src/embedding/embedding.module.ts`
- Create: `study-nest-js/src/embedding/embedding.service.ts`
- Create: `study-nest-js/src/embedding/embedding.service.spec.ts`

- [ ] **Step 1: 写 failing test（mock fetch）**

```typescript
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  it('embed 返回向量数组', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
    }) as jest.Mock;

    const service = new EmbeddingService(
      new ConfigService({
        OLLAMA_URL: 'http://localhost:11434',
        OLLAMA_EMBED_MODEL: 'nomic-embed-text',
      }),
    );

    const vector = await service.embed('hello');
    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

- [ ] **Step 2: 实现 EmbeddingService**

```typescript
@Injectable()
export class EmbeddingService {
  constructor(private readonly config: ConfigService) {}

  private getConfig() {
    return {
      baseUrl: this.config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434',
      model: this.config.get<string>('OLLAMA_EMBED_MODEL') ?? 'nomic-embed-text',
    };
  }

  async embed(text: string): Promise<number[]> {
    const { baseUrl, model } = this.getConfig();
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`Ollama embedding failed: ${res.status}`);
    }
    const data = (await res.json()) as { embedding?: number[] };
    if (!data.embedding?.length) {
      throw new Error('Ollama embedding empty');
    }
    return data.embedding;
  }
}
```

- [ ] **Step 3: 注册 EmbeddingModule 并 export EmbeddingService**

- [ ] **Step 4: 测试 PASS**

---

## Task 6: QdrantService

**Files:**
- Create: `study-nest-js/src/vector/vector.module.ts`
- Create: `study-nest-js/src/vector/qdrant.service.ts`

- [ ] **Step 1: 实现 QdrantService**

核心方法：

```typescript
async ensureCollection(vectorSize: number): Promise<void>
async upsertChunk(point: { chunkId: number; vector: number[]; payload: Record<string, unknown> }): Promise<void>
async deleteByChunkIds(chunkIds: number[]): Promise<void>
async deleteByKnowledgeBaseId(knowledgeBaseId: number): Promise<void>
async search(queryVector: number[], filter: { knowledgeBaseIds: number[] }, limit: number): Promise<Array<{ chunkId: number; score: number }>>
```

启动时 `onModuleInit` 调用 `ensureCollection`（用一次 embed 探测维度，或 env `EMBED_VECTOR_SIZE=768`）。

- [ ] **Step 2: 注册 VectorModule 并 export QdrantService**

---

## Task 7: 文档解析器

**Files:**
- Create: `study-nest-js/src/knowledge-base/parsers/parser.interface.ts`
- Create: `study-nest-js/src/knowledge-base/parsers/text.parser.ts`
- Create: `study-nest-js/src/knowledge-base/parsers/pdf.parser.ts`
- Create: `study-nest-js/src/knowledge-base/parsers/docx.parser.ts`

- [ ] **Step 1: 定义接口**

```typescript
export interface ParsedDocument {
  text: string;
  pages?: Array<{ page: number; text: string }>;
}

export interface DocumentParser {
  supports(mimeType: string, filename: string): boolean;
  parse(filePath: string): Promise<ParsedDocument>;
}
```

- [ ] **Step 2: 实现三个 parser**

- `text.parser`: `.txt` `.md` `text/plain` `text/markdown`
- `pdf.parser`: `application/pdf`，用 `pdf-parse`，填充 `pages`
- `docx.parser`: docx mime，用 `mammoth.extractRawText`

- [ ] **Step 3: 工厂方法 `resolveParser(mime, filename)` 返回对应 parser**

---

## Task 8: KnowledgeBaseService 权限（TDD）

**Files:**
- Create: `study-nest-js/src/knowledge-base/knowledge-base.service.ts`
- Create: `study-nest-js/src/knowledge-base/knowledge-base.service.spec.ts`
- Create: DTO 文件

- [ ] **Step 1: 写 canAccess 单测**

```typescript
describe('KnowledgeBaseService.canAccess', () => {
  it('owner 可访问 private', () => {
    expect(service.canAccess(kb({ userId: 1, visibility: 'private' }), { userId: 1, role: 'user' })).toBe(true);
  });
  it('非 owner 不可访问 private', () => {
    expect(service.canAccess(kb({ userId: 1, visibility: 'private' }), { userId: 2, role: 'user' })).toBe(false);
  });
  it('admin 可访问任意', () => {
    expect(service.canAccess(kb({ userId: 1, visibility: 'private' }), { userId: 9, role: 'admin' })).toBe(true);
  });
  it('team 仅同 role 可访问', () => {
    expect(service.canAccess(kb({ userId: 1, visibility: 'team' }), { userId: 2, role: 'user' })).toBe(true);
    expect(service.canAccess(kb({ userId: 1, visibility: 'team' }), { userId: 2, role: 'admin' })).toBe(false);
  });
  it('public 所有登录用户可访问', () => {
    expect(service.canAccess(kb({ userId: 1, visibility: 'public' }), { userId: 2, role: 'user' })).toBe(true);
  });
});
```

- [ ] **Step 2: 实现 CRUD**

- `findAccessible(user)` — 列表（Prisma where 组合 owner/visibility/role/admin）
- `create` / `update` / `remove` — 校验 owner 或 admin
- `findOneOrFail(id, user)` — 403 若不可访问

- [ ] **Step 3: 测试 PASS**

---

## Task 9: IngestService

**Files:**
- Create: `study-nest-js/src/knowledge-base/ingest.service.ts`

- [ ] **Step 1: 实现 ingestDocument(documentId)**

流程：
1. 加载 Document + KnowledgeBase
2. `status=processing`
3. parser 解析 → chunkService.split
4. 事务外循环：create Chunk → embed → qdrant.upsert（payload 含 visibility/ownerId/kbId）
5. 更新 `status=ready, chunkCount`
6. catch → `status=failed, errorMessage`

- [ ] **Step 2: 实现 deleteDocumentVectors(documentId)**

删 MySQL chunks + Qdrant points

---

## Task 10: RetrievalService（TDD）

**Files:**
- Create: `study-nest-js/src/knowledge-base/retrieval.service.ts`
- Create: `study-nest-js/src/knowledge-base/retrieval.service.spec.ts`

- [ ] **Step 1: 单测 mock embed + qdrant**

验证：过滤低分、合并多库结果、按 score 排序取 topK

- [ ] **Step 2: 实现 search(query, knowledgeBaseIds, user)**

```typescript
async search(
  query: string,
  knowledgeBaseIds: number[],
  user: { userId: number; role: string },
): Promise<RagChunk[]>
```

1. 校验每个 kbId 可访问
2. embed query
3. qdrant.search with filter
4. 加载 chunk + document 元数据
5. score >= threshold，返回 RagChunk[]

- [ ] **Step 3: 实现 toCitations(chunks): RagCitation[]**

snippet 取 content 前 120 字。

---

## Task 11: KnowledgeBaseController

**Files:**
- Create: `study-nest-js/src/knowledge-base/knowledge-base.controller.ts`
- Create: `study-nest-js/src/knowledge-base/knowledge-base.module.ts`
- Modify: `study-nest-js/src/app.module.ts`

- [ ] **Step 1: 实现全部路由**（见 spec §8）

上传使用 `FileInterceptor` + `diskStorage` 存 `uploads/kb/{kbId}/`

- [ ] **Step 2: 注册 KnowledgeBaseModule**

imports: PrismaModule, EmbeddingModule, VectorModule

- [ ] **Step 3: 手动验证**

```powershell
# 创建知识库 → 上传 txt → GET documents 见 ready
```

---

## Task 12: ContextBuilder RAG 注入

**Files:**
- Modify: `study-nest-js/src/conversation/context-builder.service.ts`
- Create: `study-nest-js/src/conversation/context-builder.service.spec.ts`（可选）

- [ ] **Step 1: 扩展 build options**

```typescript
options?: {
  injectPrompt?: boolean;
  promptId?: string;
  ragChunks?: RagChunk[];
  ragEnabled?: boolean; // 选了知识库但无结果
}
```

- [ ] **Step 2: 在 Prompt 模板之后注入 RAG system**

```typescript
private buildRagSystem(chunks: RagChunk[]): string { /* 见 spec §7 */ }
private buildRagEmptySystem(): string { /* 见 spec §7 */ }
```

- [ ] **Step 3: 修复短会话路径**

当 `dbMessages.length <= SUMMARY_TRIGGER` 且存在 rag system 时，仍需注入 RAG，再 append 全量 messages（当前代码 early return 需调整）。

---

## Task 13: ConversationController 接入

**Files:**
- Modify: `study-nest-js/src/conversation/conversation.controller.ts`
- Modify: `study-nest-js/src/conversation/conversation.module.ts`

- [ ] **Step 1: stream 增加 Query knowledgeBaseIds**

```typescript
@Query('knowledgeBaseIds') knowledgeBaseIds: string | undefined,
```

解析为 `number[]`（逗号分隔，过滤 NaN）。

- [ ] **Step 2: prepareStream 增加参数**

在 `contextBuilder.build` 之前：

```typescript
let ragChunks: RagChunk[] = [];
if (kbIds.length > 0) {
  try {
    ragChunks = await this.retrievalService.search(
      trimmedContent,
      kbIds,
      { userId, role: req.user.role },
    );
    subscriber 侧在 stream 开头 emit rag_retrieval
  } catch {
    // 检索失败：ragEnabled=true, ragChunks=[]
  }
}
```

注意：`prepareStream` 返回 Observable，rag_retrieval 需在 `toolOrchestrator.streamWithTools` 之前通过 `defer` + `tap` 或 orchestrator 包装发出。推荐在 `prepareStream` 内构造 `initialEvents: MessageEvent[]` 再 `concat` 到主流。

- [ ] **Step 3: 扩展 StreamPayload phase**

```typescript
phase?: 'tool_call' | 'tool_result' | 'rag_retrieval';
citations?: RagCitation[];
```

- [ ] **Step 4: ConversationModule import KnowledgeBaseModule**

---

## Task 14: 前端 knowledge-base 服务与列表页

**Files:**
- Create: `admin-web/services/knowledge-base.ts`
- Create: `admin-web/app/knowledge-bases/page.tsx`
- Modify: `admin-web/config/nav.ts`

- [ ] **Step 1: API 封装**

```typescript
export type KnowledgeBaseVisibility = 'private' | 'team' | 'public';

export interface KnowledgeBase {
  id: number;
  name: string;
  description?: string | null;
  visibility: KnowledgeBaseVisibility;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export function getKnowledgeBases(): Promise<KnowledgeBase[]>
export function createKnowledgeBase(data: {...}): Promise<KnowledgeBase>
export function updateKnowledgeBase(id: number, data: {...}): Promise<KnowledgeBase>
export function deleteKnowledgeBase(id: number): Promise<void>
```

- [ ] **Step 2: 列表页**

Table/Card：名称、可见性 Tag（private/team/public）、创建时间、进入详情、删除

- [ ] **Step 3: nav 新增**

```typescript
{ href: '/knowledge-bases', label: '知识库', icon: 'book' },
```

同步更新 `NavIconKey` 与 `AppShell` 图标映射。

---

## Task 15: 前端知识库详情页

**Files:**
- Create: `admin-web/app/knowledge-bases/[id]/page.tsx`

- [ ] **Step 1: 文档列表 + Upload**

显示 status（Tag：pending/processing/ready/failed）、chunkCount

- [ ] **Step 2: 检索预览**

Input + 按钮调 `POST .../search`，展示 snippet/score

- [ ] **Step 3: 编辑可见性 / 删除文档**

---

## Task 16: 聊天页 RAG 集成

**Files:**
- Modify: `admin-web/services/ai.ts`
- Modify: `admin-web/hooks/useChatMessages.ts`
- Create: `admin-web/components/chat/KnowledgeBasePicker.tsx`
- Create: `admin-web/components/chat/CitationBlock.tsx`
- Modify: `admin-web/components/chat/ChatMessageItem.tsx`
- Modify: `admin-web/app/chat/page.tsx`
- Modify: `admin-web/app/globals.css`

- [ ] **Step 1: streamChat 扩展**

```typescript
export interface RagCitation { chunkId: number; documentName: string; page?: number | null; snippet: string; score: number; }

export interface StreamChatOptions {
  // ...
  knowledgeBaseIds?: number[];
  onRagRetrieval?: (citations: RagCitation[]) => void;
}
```

解析 `phase === 'rag_retrieval'`。

- [ ] **Step 2: useChatMessages 增加 citations**

```typescript
export interface ChatMessage {
  // ...
  citations?: RagCitation[];
}
```

- [ ] **Step 3: KnowledgeBasePicker**

加载 `getKnowledgeBases()`，多选 Checkbox/Chips

- [ ] **Step 4: CitationBlock**

展示 documentName、page、snippet、score

- [ ] **Step 5: chat/page.tsx**

- 空会话展示 Picker
- handleSend 传 `knowledgeBaseIds`
- onRagRetrieval 写入当前 assistant 临时消息
- 切换会话清空选择

---

## Task 17: 构建与验收

- [ ] **Step 1: 后端测试**

```powershell
Set-Location "d:\Note\NestJS\study-nest-js"
pnpm test
pnpm run build
```

- [ ] **Step 2: 前端构建**

```powershell
Set-Location "d:\Note\NestJS\admin-web"
npm run build
```

- [ ] **Step 3: 手动验收清单**（spec §13）

| # | 场景 | 预期 |
|---|------|------|
| 1 | user A private 库 | user B 不可见 |
| 2 | 改 public | user B 可检索引用 |
| 3 | team 库 | 仅同 role 可见 |
| 4 | 上传 DOCX | ready + 问答有引用 |
| 5 | 无关问题 | 「未找到相关信息」 |
| 6 | admin | 可管理全部库 |
| 7 | SSE | rag_retrieval + CitationBlock |

---

## 实现顺序建议

```
Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11
                                    ↓
              Task 12 → 13（聊天接入）
                                    ↓
              Task 14 → 15 → 16 → 17
```

后端 Task 11 完成后即可用 Swagger/curl 验证入库与检索；前端可并行 Task 14。
