# Node 环境
FROM node:20

# 工作目录
WORKDIR /app

# 复制 package
COPY package*.json ./

# 安装依赖
RUN npm install

# 先复制 prisma
COPY prisma ./prisma

# 生成 Prisma Client
RUN npx prisma generate

# 再复制全部项目
COPY . .

# 打包
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "dist/main"]