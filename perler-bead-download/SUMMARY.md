# 拼豆图纸生成器 - 独立部署版本

## ✅ 已生成文件

### 核心代码
- `src/index.ts` - 主服务入口（Express + TypeScript）
- `src/api/generate.ts` - AI 图像生成接口
- `src/api/remove-bg.ts` - 抠图接口
- `src/api/upload.ts` - 上传接口

### AI 客户端
- `src/lib/coze-api.ts` - Coze 官方 API 客户端（推荐）
- `src/lib/stability.ts` - Stability AI 客户端
- `src/lib/tencent.ts` - 腾讯云混元客户端
- `src/lib/cos.ts` - 腾讯云 COS 工具

### 配置文件
- `package.json` - 依赖配置
- `tsconfig.json` - TypeScript 配置
- `.env.example` - 环境变量模板
- `.gitignore` - Git 忽略配置

### 部署文件
- `Dockerfile` - Docker 镜像配置
- `docker-compose.yml` - Docker Compose 编排
- `nginx.conf` - Nginx 反向代理配置

### 文档
- `README.md` - 项目说明
- `QUICKSTART.md` - 快速开始指南
- `DEPLOYMENT.md` - 详细部署指南

---

## 🚀 快速开始

### 1. 安装依赖
```bash
cd perler-bead-server
pnpm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
nano .env
```

**必填配置：**
```env
# 选择 AI 方案（推荐 coze）
AI_PROVIDER=coze

# Coze API 配置
COZE_API_TOKEN=your_token_here
COZE_AGENT_ID=your_agent_id_here

# 腾讯云配置
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
COS_BUCKET=your-bucket-name
```

### 3. 启动服务
```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start

# Docker 模式
docker-compose up -d
```

### 4. 访问服务
- API 地址：http://localhost:3000
- 健康检查：http://localhost:3000/api/health

---

## 🎯 AI 方案对比

| 方案 | 效果 | 费用 | 难度 | 推荐度 |
|------|------|------|------|--------|
| **Coze API** | ⭐⭐⭐⭐⭐ | 0.1-0.2元/次 | 中等 | ⭐⭐⭐⭐⭐ |
| Stability AI | ⭐⭐⭐⭐ | 0.3-0.5元/次 | 简单 | ⭐⭐⭐⭐ |
| 腾讯云混元 | ⭐⭐ | 0.1元/次 | 简单 | ⭐⭐ |

**推荐：Coze API** - 效果最好，最接近沙箱版本

---

## 📡 API 接口

### POST /api/generate
AI 图像卡通化

```json
// 请求
{
  "imageUrl": "https://example.com/image.jpg",
  "style": "ghibli"
}

// 响应
{
  "success": true,
  "imageUrl": "https://example.com/generated.jpg",
  "provider": "coze"
}
```

### POST /api/remove-bg
去除图片背景

### POST /api/upload
上传图片到 COS

---

## 💰 费用估算

### 服务器费用
- 2核4G 轻量服务器：~100元/月
- 域名：~60元/年
- SSL 证书：免费

### API 调用费用（Coze）
- 100次/月：~15元/月
- 1000次/月：~150元/月
- 10000次/月：~1500元/月

### 总费用
- **低流量**（100次/月）：约 1300元/年
- **中流量**（1000次/月）：约 1500元/年
- **高流量**（10000次/月）：约 3000元/年

---

## 🔧 部署选项

### 选项1：Docker Compose（最简单）
```bash
docker-compose up -d
```

### 选项2：PM2 + Nginx
```bash
pnpm build
pm2 start npm --name "perler-bead" -- start
```

### 选项3：Kubernetes
适合大规模部署

---

## 📚 文档说明

- **README.md** - 项目总体说明
- **QUICKSTART.md** - 快速开始指南（5分钟上手）
- **DEPLOYMENT.md** - 详细部署指南（完整教程）

---

## ⚠️ 重要说明

### Coze API 获取方式

1. 登录 https://www.coze.com
2. 创建智能体
3. 添加"图像生成"插件
4. 配置提示词（参考 QUICKSTART.md）
5. 部署为 API 服务
6. 获取 API Token 和 Agent ID

### 前端配合

前端需要修改 API 调用地址：
```javascript
// 原来（沙箱环境）
const response = await fetch('/api/generate', { ... });

// 现在（你的服务器）
const response = await fetch('https://yourbeans.com/api/generate', { ... });
```

---

## 🎉 完成！

现在你有了完整的独立部署版本：
- ✅ 支持 3 种 AI 方案
- ✅ Docker 部署支持
- ✅ Nginx 反向代理
- ✅ 完整的文档
- ✅ 生产级代码

**下一步：**
1. 获取 Coze API Token
2. 配置环境变量
3. 部署到服务器
4. 绑定域名
5. 测试功能

祝部署顺利！🚀
