# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json
COPY package.json pnpm-lock.yaml* ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建
RUN pnpm build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json 和构建产物
COPY package.json pnpm-lock.yaml* ./
COPY --from=builder /app/dist ./dist

# 安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# 创建上传目录
RUN mkdir -p uploads public/uploads

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["pnpm", "start"]
