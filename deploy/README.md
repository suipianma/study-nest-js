# Docker 部署（双仓库 CI）

前后端是 **两个 Git 仓库**，各推各的镜像；本目录用 compose **一起拉起来**。

| 镜像 | 构建触发 |
|------|----------|
| `suipianma/study-nest-js:latest` | push **study-nest-js** 仓库 |
| `suipianma/admin-web:latest` | push **admin-web** 仓库 |

## 本机使用

```powershell
cd study-nest-js\deploy
copy .env.local.example .env
docker compose up -d
```

更新：`.\update.ps1` 或后端 push 后 Runner 自动 pull。

## 两个仓库都要配的 Secrets

`DOCKER_USERNAME`、`DOCKER_PASSWORD`

## Variables 分工

| 仓库 | Variable |
|------|----------|
| admin-web | `PUBLIC_API_BASE=http://localhost:3000` |
| study-nest-js | `ENABLE_LOCAL_DEPLOY=true`（装 Runner 后） |

完整说明见仓库根目录 **SETUP.md**。
