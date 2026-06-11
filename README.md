# study-nest-js

基于 NestJS 11 的后端学习项目，当前实现了用户认证、用户管理、文件上传、Redis 缓存、Socket.IO 消息推送、SSE 示例、Swagger 接口文档和 Prisma/MySQL 数据访问。

## 技术栈

- NestJS 11
- TypeScript
- Prisma + MySQL
- JWT + Passport
- Redis + ioredis
- Socket.IO
- Swagger
- Winston
- Docker / Docker Compose

## 目录结构

```text
src
├── ai                 # SSE 示例接口
├── auth               # 注册、登录、刷新 token、退出登录
├── chat               # WebSocket 消息与服务端推送
├── common             # 装饰器、守卫、过滤器、拦截器、日志中间件
├── prisma             # PrismaService / PrismaModule
├── redis              # Redis 连接封装
├── upload             # 文件上传
├── user               # 用户 CRUD
├── app.module.ts      # 根模块
└── main.ts            # 应用入口、全局管道、Swagger、静态资源
```

## 环境要求

- Node.js 20+
- pnpm
- MySQL 8
- Redis 7

## 环境变量

本地开发脚本通过 `node --env-file=.env.dev` 读取 `.env.dev`，Docker Compose 通过 `env_file: .env.docker` 读取 `.env.docker`，不需要手动复制 `.env`。

当前项目使用的变量如下：

```env
DATABASE_URL="mysql://root:qwer1234@localhost:3306/ai_admin"
JWT_ACCESS_SECRET="xiaoyao_ai_admin_access_secret"
JWT_ACCESS_EXPIRES_IN="30m"
JWT_REFRESH_SECRET="xiaoyao_ai_admin_refresh_secret"
JWT_REFRESH_EXPIRES_IN="7d"
APP_URL="http://localhost:3000"
REDIS_HOST="localhost"
REDIS_PORT=6379
```

如果使用 `docker-compose.yml` 启动应用、MySQL 和 Redis，应用容器内的服务名需要使用 Docker Compose 网络地址：

```env
DATABASE_URL="mysql://root:qwer1234@mysql:3306/ai_admin"
REDIS_HOST="redis"
REDIS_PORT=6379
```

## 本地运行

本地运行需要先准备本机的 MySQL 8 和 Redis 7，并确保 `.env.dev` 中的连接地址可用：

```env
DATABASE_URL="mysql://root:qwer1234@localhost:3306/ai_admin"
REDIS_HOST="localhost"
REDIS_PORT=6379
```

```bash
# 安装依赖
pnpm install

# 生成 Prisma Client
pnpm run prisma:generate

# 执行已有迁移
pnpm run prisma:migrate

# 开发监听模式启动
pnpm run start:dev
```

开发阶段如需创建新的迁移：

```bash
pnpm run prisma:migrate:dev
```

生产方式本地运行：

```bash
pnpm run build
pnpm run start:prod
```

服务默认监听 `http://localhost:3000`。

## Docker 运行

Docker Compose 会同时启动应用、MySQL 和 Redis。应用容器读取 `.env.docker`，其中 MySQL 和 Redis 地址使用 Compose 服务名：

```env
DATABASE_URL="mysql://root:qwer1234@mysql:3306/ai_admin"
REDIS_HOST="redis"
REDIS_PORT=6379
```

```bash
# 构建并启动全部服务
docker compose up -d --build

# 首次启动或迁移更新后，执行数据库迁移
docker compose exec app npx prisma migrate deploy

# 查看服务状态
docker compose ps

# 查看应用日志
docker compose logs -f app
```

`docker-compose.yml` 会启动：

- `app`：NestJS 应用，映射 `3000:3000`
- `mysql`：MySQL 8，默认数据库 `ai_admin`
- `redis`：Redis 7，映射 `6379:6379`

停止 Docker 服务：

```bash
docker compose down
```

## 接口文档

启动服务后访问 Swagger：

```text
http://localhost:3000/docs
```

## 已有功能

- 认证模块：注册、登录、刷新 token、退出登录
- 登录保护：登录失败会基于 IP 记录到 Redis，超过限制后短时间锁定
- 用户模块：用户创建、查询、更新、删除，其中用户列表接口需要 JWT 和 `admin` 角色
- 文件上传：上传后文件保存到 `uploads` 目录，可通过 `/uploads/...` 静态访问
- 聊天模块：Socket.IO 连接鉴权、消息回复、HTTP 接口主动广播
- SSE 示例：`/ai/stream` 和 `/ai/chat`
- 全局处理：参数校验、统一响应格式、HTTP 异常格式化、请求日志

## 常用接口

```text
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

POST   /users
GET    /users
GET    /users/:id
PATCH  /users/:id
DELETE /users/:id

POST   /upload
POST   /chat/push
GET    /ai/stream
GET    /ai/chat
```

## WebSocket

服务使用 Socket.IO，连接时会通过 `WsJwtGuard` 校验 JWT。客户端需要通过 `handshake.auth.token` 或 `Authorization: Bearer <token>` 携带有效 access token。

已连接客户端可监听：

- `reply`：服务端对 `message` 事件的回复
- `push`：服务端广播推送

## 测试与代码检查

```bash
# 单元测试
pnpm run test

# e2e 测试
pnpm run test:e2e

# 覆盖率
pnpm run test:cov

# ESLint 自动修复
pnpm run lint

# Prettier 格式化
pnpm run format
```

## License

UNLICENSED
