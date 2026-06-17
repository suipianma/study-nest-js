# pnpm 11+ 依赖 node:sqlite，需 Node 22+
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm exec prisma generate

COPY . .
RUN pnpm run build

EXPOSE 3000

# 启动前自动执行迁移
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main"]
