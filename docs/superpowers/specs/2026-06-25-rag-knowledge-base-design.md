# AI 企业知识库 RAG 设计规格

**日期：** 2026-06-25  
**状态：** 已批准  
**范围：** study-nest-js（后端）+ admin-web（知识库管理 + 聊天引用）  
**对齐：** `AI学习扩展.md` RAG 章节、`AI 全栈.md` 阶段 3

---

## 1. 背景与目标

当前聊天链路为「用户 → 检索（无）→ Ollama → 流式回复」，模型只能基于训练数据与对话历史回答，无法基于企业上传文档作答。

**目标：** 实现企业知识库 RAG：

```
用户上传 PDF/DOCX/TXT/MD
  ↓
解析 → 切片 → Ollama Embedding → Qdrant
  ↓
聊天勾选知识库 + 提问
  ↓
检索 topK 片段 → 注入 ContextBuilder system
  ↓
Ollama 流式回答 + 前端引用卡片
```

**本期做：**

- 知识库 CRUD + 可见性（`private` / `team` / `public`）
- 文档上传、解析、切片、向量化、索引
- 聊天 stream 前检索，注入 `ContextBuilder`
- SSE `rag_retrieval` 事件 + 前端 `CitationBlock`
- 知识库管理页（列表 + 详情）
- `admin` 可管理全部知识库

**本期不做：**

- 文档级 ACL、指定用户授权
- Rerank、混合检索、OCR 扫描件
- Bull 异步队列（小文件同步索引；大文件第二期）
- `search_knowledge` Function Calling 工具
- citations 落库

---

## 2. 方案选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 架构 | 模块化 RAG 管线（方案 A） | 与 Conversation / AI 模块解耦，边界清晰 |
| 向量库 | Qdrant（Docker） | 不改 MySQL；payload 过滤权限 |
| Embedding | Ollama `/api/embeddings` | 与现有 Ollama 栈一致 |
| 聊天接入 | Stream 前检索 → ContextBuilder | 引用稳定，不依赖模型是否调工具 |
| 权限 | owner + 共享（private/team/public） | 满足企业多用户，避免第一期 ACL 复杂度 |

---

## 3. 权限模型

```typescript
type KnowledgeBaseVisibility = 'private' | 'team' | 'public';
```

| 操作 | owner | 同 role（team 可见时） | 其他 user | admin |
|------|-------|------------------------|-----------|-------|
| 列表可见 private | ✅ | ❌ | ❌ | ✅ |
| 列表可见 team | ✅ | ✅（同 role） | ❌ | ✅ |
| 列表可见 public | ✅ | ✅ | ✅ | ✅ |
| 检索 private | ✅ | ❌ | ❌ | ✅ |
| 检索 team | ✅ | ✅（同 role） | ❌ | ✅ |
| 检索 public | ✅ | ✅ | ✅ | ✅ |
| 编辑/删库/上传 | ✅ | ❌ | ❌ | ✅ |
| 创建知识库 | ✅ | ✅ | ✅ | ✅ |

**team 定义：** 与知识库 owner 的 `User.role` 字段相同的所有登录用户（当前为 `admin` / `user`）。

**检索安全：** Qdrant 查询必须带 `knowledgeBaseId IN (可访问 id 列表)` filter；服务层对返回 chunk 二次校验所属知识库权限。

---

## 4. 架构

```
admin-web
  ├─ /knowledge-bases              列表
  ├─ /knowledge-bases/[id]         详情（文档、上传、检索预览）
  └─ /chat                         KnowledgeBasePicker + CitationBlock

study-nest-js
  ├─ knowledge-base/
  │    ├─ knowledge-base.controller.ts
  │    ├─ knowledge-base.service.ts    # CRUD + 权限
  │    ├─ ingest.service.ts            # 解析→切片→索引
  │    ├─ retrieval.service.ts         # 检索 + citations
  │    ├─ chunk.service.ts
  │    └─ parsers/ (pdf, text, docx)
  ├─ embedding/
  │    └─ embedding.service.ts         # Ollama embeddings
  ├─ vector/
  │    └─ qdrant.service.ts
  └─ conversation/
       ├─ context-builder.service.ts    # + ragChunks 注入
       └─ conversation.controller.ts     # + knowledgeBaseIds
```

**Context 注入顺序：**

1. Prompt 模板 system（首条，可选）
2. **RAG 参考资料 system**（本次检索结果）
3. 历史摘要 system（消息数 > SUMMARY_TRIGGER 时）
4. 近期 messages / 全量历史

---

## 5. 数据模型

### MySQL（Prisma）

```prisma
model KnowledgeBase {
  id          Int        @id @default(autoincrement())
  userId      Int
  name        String     @db.VarChar(100)
  description String?    @db.VarChar(500)
  visibility  String     @default("private") @db.VarChar(20)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  documents   Document[]

  @@index([userId, updatedAt])
  @@index([visibility])
}

model Document {
  id              Int           @id @default(autoincrement())
  knowledgeBaseId Int
  filename        String        @db.VarChar(255)
  mimeType        String        @db.VarChar(100)
  filePath        String        @db.VarChar(500)
  status          String        @default("pending") @db.VarChar(20)
  errorMessage    String?       @db.Text
  chunkCount      Int           @default(0)
  createdAt       DateTime      @default(now())
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  chunks          Chunk[]

  @@index([knowledgeBaseId, createdAt])
}

model Chunk {
  id         Int      @id @default(autoincrement())
  documentId Int
  index      Int
  content    String   @db.Text
  page       Int?
  tokenCount Int?
  createdAt  DateTime @default(now())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId, index])
}
```

**Document.status：** `pending` | `processing` | `ready` | `failed`

### Qdrant

- Collection：`knowledge_chunks`（启动时 ensure）
- Point id：`chunkId`（MySQL Chunk.id）
- Vector 维度：与 `OLLAMA_EMBED_MODEL` 一致（`nomic-embed-text` 为 768）
- Payload：

```json
{
  "chunkId": 123,
  "documentId": 5,
  "knowledgeBaseId": 2,
  "ownerId": 1,
  "visibility": "public"
}
```

---

## 6. 入库流程（Ingest）

1. `POST /knowledge-bases/:id/documents` 接收 multipart 文件
2. 校验：owner/admin、MIME 白名单、大小 ≤ `RAG_MAX_FILE_MB`
3. 保存至 `uploads/kb/{knowledgeBaseId}/{timestamp}-{filename}`
4. 创建 `Document(status=pending)`，同步执行 ingest（本期）
5. `status=processing` → 解析文本 → `ChunkService.split` → 逐 chunk：
   - 写 MySQL Chunk
   - `EmbeddingService.embed(text)` → `QdrantService.upsert`
6. 成功：`status=ready, chunkCount=N`；失败：`status=failed, errorMessage`

**解析器：**

| MIME / 扩展名 | 解析器 |
|---------------|--------|
| `application/pdf` | `pdf-parse` |
| `text/plain`, `text/markdown` | 直接读 UTF-8 |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth` extractRawText |

**切片参数（env）：**

```env
RAG_CHUNK_SIZE=600
RAG_CHUNK_OVERLAP=100
```

---

## 7. 检索与聊天流程

### 检索 API

`POST /knowledge-bases/:id/search`

```json
{ "query": "年假多少天", "topK": 5 }
```

响应：

```json
{
  "items": [
    {
      "chunkId": 12,
      "documentName": "员工手册.pdf",
      "page": 3,
      "snippet": "工作满1年享受5天年假…",
      "score": 0.84
    }
  ]
}
```

### 聊天接入

`GET /conversations/:id/stream?content=...&knowledgeBaseIds=1,2&promptId=...`

1. 解析 `knowledgeBaseIds`（逗号分隔，去重）
2. 对每个 id 校验当前用户可访问
3. `RetrievalService.search(query, ids, user)`：
   - embed query
   - Qdrant search，`score >= RAG_SCORE_THRESHOLD`
   - 合并去重，取 top `RAG_TOP_K`
4. SSE 推送：

```json
{
  "phase": "rag_retrieval",
  "citations": [
    {
      "chunkId": 12,
      "documentName": "员工手册.pdf",
      "page": 3,
      "snippet": "工作满1年…",
      "score": 0.84
    }
  ]
}
```

5. `ContextBuilder.build(conv, messages, { ..., ragChunks })`
6. 继续现有 `ToolOrchestrator.streamWithTools` 流程

### RAG System Prompt 模板

```text
以下是与用户问题相关的参考资料。请仅根据资料回答；资料未提及则说明「知识库中未找到相关信息」，不要编造。

【资料1】来源：《{documentName}》{pageLabel}
内容：{chunkContent}

回答要求：
1. 优先引用资料原文
2. 在句末标注来源，如 [资料1]
3. 资料冲突时说明冲突并列出各方说法
```

无检索结果时注入：

```text
用户已选择知识库，但本次检索未找到与问题相关的资料。请明确告知「知识库中未找到相关信息」，不要编造。
```

---

## 8. HTTP API

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/knowledge-bases` | JWT | 当前用户可访问的知识库 |
| POST | `/knowledge-bases` | JWT | 创建 `{ name, description?, visibility? }` |
| GET | `/knowledge-bases/:id` | 可访问 | 详情 |
| PATCH | `/knowledge-bases/:id` | owner/admin | 更新名称/描述/可见性 |
| DELETE | `/knowledge-bases/:id` | owner/admin | 级联删除 |
| GET | `/knowledge-bases/:id/documents` | 可访问 | 文档列表 |
| POST | `/knowledge-bases/:id/documents` | owner/admin | multipart 上传 |
| DELETE | `/knowledge-bases/:id/documents/:docId` | owner/admin | 删文档+向量 |
| POST | `/knowledge-bases/:id/search` | 可访问 | 检索预览 |
| GET | `/conversations/:id/stream` | JWT | 新增 `knowledgeBaseIds` query |

---

## 9. 前端

### 路由

| 路径 | 说明 |
|------|------|
| `/knowledge-bases` | 列表、创建、可见性 Tag |
| `/knowledge-bases/[id]` | 文档管理、上传、检索预览 |

`config/nav.ts` 新增「知识库」入口（所有登录用户可见）。

### 聊天页

- `KnowledgeBasePicker`：多选可访问知识库（空会话时展示，与 PromptTemplatePicker 并列）
- `streamChat` 增加 `knowledgeBaseIds`
- `onRagRetrieval` 回调 → 临时消息字段 `citations`
- `CitationBlock`：展示引用卡片（参考 `ToolCallBlock` 样式）
- 切换会话清空 `selectedKnowledgeBases`

---

## 10. 基础设施

### docker-compose 新增

```yaml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"
  volumes:
    - qdrant_data:/qdrant/storage
```

`docker:infra` 脚本改为启动 `mysql redis qdrant`。

### 环境变量

```env
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=knowledge_chunks
OLLAMA_EMBED_MODEL=nomic-embed-text
RAG_CHUNK_SIZE=600
RAG_CHUNK_OVERLAP=100
RAG_TOP_K=5
RAG_SCORE_THRESHOLD=0.6
RAG_MAX_FILE_MB=20
```

### 依赖

```json
"@qdrant/js-client-rest": "^1.12.0",
"pdf-parse": "^1.1.1",
"mammoth": "^1.9.0"
```

SETUP.md 补充：`ollama pull nomic-embed-text`

---

## 11. 错误处理

| 场景 | 行为 |
|------|------|
| Qdrant 不可用 | 上传索引失败 `Document.status=failed`；聊天检索跳过 RAG，注入「检索服务不可用」system |
| Ollama embed 失败 | 同上 |
| 不支持的 MIME | 400 Bad Request |
| 文件超大 | 413 Payload Too Large |
| 越权访问知识库 | 403 Forbidden |
| 空 knowledgeBaseIds | 不检索，走原有聊天流程 |

---

## 12. 测试策略

| 层级 | 内容 |
|------|------|
| 单元 | `ChunkService.split`、`KnowledgeBaseService.canAccess`、`RetrievalService` 权限过滤 |
| 单元 | `ContextBuilder` RAG system 注入顺序 |
| 集成 | Ingest（mock Qdrant + mock Embedding） |
| 手动 | 双用户 private/public 隔离、PDF/DOCX 问答引用 |

---

## 13. 验收标准

1. user A 创建 `private` 库，user B 不可见、不可检索
2. user A 设为 `public`，user B 可检索并聊天引用
3. `team` 库仅同 role 用户可见
4. 上传 PDF/DOCX 后 `status=ready`，问答带正确 `documentName`
5. 知识库外问题，模型回答「未找到相关信息」
6. admin 可管理全部知识库
7. SSE 推送 `rag_retrieval`，前端展示 `CitationBlock`
8. 前后端 `build` 通过，新增单元测试通过

---

## 14. 后续迭代（非本期）

- Bull 异步索引、Rerank、混合检索
- `search_knowledge` Function Calling
- citations 落库、XLSX、OCR
- 知识库级指定用户 ACL
