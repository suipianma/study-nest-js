# 从零完整配置（双 Git 仓库）

后端、前端是 **两个独立 GitHub 仓库**，部署与 CI 说明以本文为准。

| 仓库 | 地址 |
|------|------|
| 后端 | https://github.com/suipianma/study-nest-js.git |
| 前端 | https://github.com/suipianma/admin-web.git |

---

## 1. 安装软件

Git、Node 20+、pnpm、Docker Desktop、Ollama  
`ollama pull deepseek-r1:1.5b`

RAG 知识库还需：

- **Qdrant** 向量库（随 `pnpm run docker:infra` 启动）：http://localhost:6333  
- **Embedding 模型**（Ollama）：`ollama pull nomic-embed-text`

`.env.dev` 中可配置（后续 RAG 模块会读取）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `QDRANT_URL` | Qdrant HTTP 地址 | `http://localhost:6333` |
| `OLLAMA_EMBED_MODEL` | Ollama embedding 模型名 | `nomic-embed-text` |

---

## 2. 本地目录（兄弟文件夹）

```powershell
mkdir D:\work\ai-admin
cd D:\work\ai-admin

git clone https://github.com/suipianma/study-nest-js.git
git clone https://github.com/suipianma/admin-web.git
```

```text
ai-admin/
├── study-nest-js/    ← 后端仓库（含 deploy/ scripts/ SETUP）
└── admin-web/        ← 前端仓库
```

**不要**把两个仓库嵌在一个没有 remote 的父目录里做 git。

---

## 3. GitHub 配置（两个仓库都要配）

### Secrets（两个仓库相同）

| Name | Value |
|------|-------|
| `DOCKER_USERNAME` | Docker Hub 用户名 `suipianma` |
| `DOCKER_PASSWORD` | Docker Hub Access Token |

### Variables

| 仓库 | Name | Value |
|------|------|-------|
| **admin-web** | `PUBLIC_API_BASE` | `http://localhost:3000` |
| **study-nest-js** | `ENABLE_LOCAL_DEPLOY` | `false`（有 Runner 后改 `true`） |
| study-nest-js | `ENABLE_SSH_DEPLOY` | `false` |

### CI 分工

```text
push admin-web     → Next.js CI（build）
                   → Build And Push Docker Image → suipianma/admin-web:latest
push study-nest-js → NestJS CI / Backend CI/CD → suipianma/study-nest-js:latest
                     + 本机 Runner 可自动 docker compose pull（可选）
```

---

## 4. 模式 A：本地开发

```powershell
cd study-nest-js
.\scripts\setup-dev.ps1
```

然后两个终端：

```powershell
# 终端 1
cd study-nest-js
pnpm run start:dev

# 终端 2
cd admin-web
npm run dev
```

- 前端 http://localhost:3001  
- 后端 http://localhost:3000  

---

## 5. 模式 B：Docker 部署（CI 镜像）

先确保两个仓库都 push 过，Actions 已成功推镜像。

```powershell
cd study-nest-js
.\scripts\setup-deploy.ps1
```

或：

```powershell
cd study-nest-js\deploy
copy .env.local.example .env
docker compose up -d
```

更新：`deploy\update.ps1`（前后端镜像可能需分别 push 后再 pull 一次）。

---

## 6. Self-hosted Runner（可选）

装在本机 Windows，仓库选 **study-nest-js**（deploy 在这边）。  
`ENABLE_LOCAL_DEPLOY=true` 后，push 后端会自动 pull；**前端镜像更新后**需再 pull 一次或 push 后端触发 redeploy。

---

## 7. 推送代码到正确远程

```powershell
# 后端
cd study-nest-js
git remote -v
# 应为 origin  https://github.com/suipianma/study-nest-js.git
git push origin main

# 前端
cd admin-web
git remote -v
# 应为 origin  https://github.com/suipianma/admin-web.git
git push origin main
```

---

## 8. 文件归属

| 只在 study-nest-js | 只在 admin-web |
|-------------------|---------------|
| `deploy/` | `Dockerfile` |
| `scripts/` | `.env.development` |
| `SETUP.md`、`.env.dev` | `.github/workflows/ci-cd.yml` |
| `.github/workflows/ci-cd.yml` | 前端源码 |
| `docker-compose.yml`（infra） | |

更多环境说明见 **环境.md**、**deploy/README.md**。

---

## 9. MCP Filesystem（Agent 集成）

Agent 模块通过 MCP（Model Context Protocol）读取本地文件，供 LLM 工具调用。

**要求**

- Node.js **18+**（与项目其余部分一致，推荐 Node 20+）

**运行方式**

- 应用启动时会自动通过 stdio 拉起 `npx @modelcontextprotocol/server-filesystem`，无需单独安装或手动启动 MCP 服务。

**环境变量**（`.env.dev`）

| 变量 | 说明 | 示例 |
|------|------|------|
| `MCP_FILESYSTEM_ENABLED` | 是否启用 filesystem MCP | `true` |
| `MCP_FILESYSTEM_ROOTS` | 只读白名单目录，逗号分隔，路径相对 `study-nest-js` 工作目录 | `../docs,./uploads/kb` |

- `MCP_FILESYSTEM_ROOTS` 为**只读**白名单：MCP 仅能访问列出的目录及其子路径。
- 仓库根目录的设计文档在 `../docs`；知识库上传文件在 `./uploads/kb`。
- 本地不需要 MCP 时，设置 `MCP_FILESYSTEM_ENABLED=false` 即可禁用。
