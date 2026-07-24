# 拼豆图纸生成器 - 独立部署版本

## 📦 项目结构

```
perler-bead-server/
├── src/
│   ├── index.ts          # 主服务入口
│   ├── api/
│   │   ├── generate.ts   # AI 图像生成接口
│   │   ├── remove-bg.ts  # 抠图接口
│   │   └── upload.ts     # 上传接口
│   └── lib/
│       ├── coze-api.ts   # Coze 官方 API 客户端
│       ├── stability.ts  # Stability AI 客户端
│       ├── tencent.ts    # 腾讯云混元客户端
│       └── cos.ts        # 腾讯云 COS 工具
├── docker-compose.yml    # Docker 编排
├── Dockerfile            # Docker 镜像
├── nginx.conf            # Nginx 配置
└── .env.example          # 环境变量模板
```

## 🚀 快速开始

### 1. 安装依赖

```bash
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

# Coze API 配置（推荐）
COZE_API_TOKEN=your_token_here
COZE_AGENT_ID=your_agent_id_here

# 腾讯云配置（用于对象存储）
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
COS_BUCKET=your-bucket-name
```

### 3. 启动服务

**开发模式：**
```bash
pnpm dev
```

**生产模式：**
```bash
pnpm build
pnpm start
```

**Docker 模式：**
```bash
docker-compose up -d
```

### 4. 访问服务

- API 地址：http://localhost:3000
- 健康检查：http://localhost:3000/api/health

## 🎯 AI 方案选择

### 方案A：Coze 官方 API（推荐⭐）

**优点：**
- 效果最好，接近沙箱版本
- 支持多种风格
- 稳定可靠

**获取方式：**
1. 登录 https://www.coze.com
2. 创建智能体
3. 添加"图像生成"插件
4. 部署为 API 服务
5. 获取 API Token 和 Agent ID

**费用：** 约 0.1-0.2元/次

### 方案B：Stability AI

**优点：**
- 效果较好
- 国际服务

**获取方式：**
1. 注册 https://stability.ai
2. 获取 API Key

**费用：** 约 0.3-0.5元/次

### 方案C：腾讯云混元

**优点：**
- 国内服务，速度快
- 已有密钥可直接使用

**缺点：**
- 效果相对较差

**费用：** 约 0.1元/次

## 📡 API 接口

### POST /api/generate

AI 图像卡通化

**请求：**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "style": "ghibli"
}
```

**风格选项：**
- `ghibli` - 吉卜力风格
- `chibi_cartoon` - Q版卡通
- `anime_pixel` - 动漫像素
- `retro_game` - 复古游戏
- `chibi` - Q版风格

**响应：**
```json
{
  "success": true,
  "imageUrl": "https://example.com/generated.jpg",
  "provider": "coze"
}
```

### POST /api/remove-bg

去除图片背景

**请求：**
```json
{
  "imageUrl": "https://example.com/image.jpg"
}
```

**响应：**
```json
{
  "success": true,
  "imageUrl": "https://example.com/no-bg.png"
}
```

### POST /api/upload

上传图片

**请求：**
```
Content-Type: multipart/form-data
file: <图片文件>
```

**响应：**
```json
{
  "success": true,
  "url": "https://example.com/uploaded.jpg",
  "filename": "1234567890-image.jpg"
}
```

## 🐳 Docker 部署

### 构建镜像

```bash
docker build -t perler-bead-server .
```

### 运行容器

```bash
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/uploads:/app/uploads \
  --name perler-bead \
  perler-bead-server
```

### 使用 Docker Compose

```bash
# 启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

## 🔧 部署到服务器

详细部署指南请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

### 快速部署（推荐）

```bash
# 1. 上传代码到服务器
scp -r perler-bead-server user@server:/opt/

# 2. SSH 登录服务器
ssh user@server

# 3. 配置环境变量
cd /opt/perler-bead-server
cp .env.example .env
nano .env

# 4. 启动服务
docker-compose up -d

# 5. 配置 Nginx
cp nginx.conf /etc/nginx/nginx.conf
nano /etc/nginx/nginx.conf  # 修改域名
sudo nginx -t
sudo systemctl reload nginx
```

## 📊 费用估算

### 服务器费用
- 2核4G 轻量服务器：~100元/月
- 域名：~60元/年
- SSL 证书：免费

### API 调用费用
- Coze API：0.1-0.2元/次
- Stability AI：0.3-0.5元/次
- 腾讯云混元：0.1元/次

### 总费用
- **低流量**（100次/月）：约 1300元/年
- **中流量**（1000次/月）：约 1500元/年
- **高流量**（10000次/月）：约 3000元/年

## 🔍 故障排查

### 服务无法启动

```bash
# 查看日志
docker-compose logs perler-bead-server
# 或
pm2 logs perler-bead

# 检查端口
netstat -tlnp | grep 3000
```

### API 调用失败

```bash
# 测试健康检查
curl http://localhost:3000/api/health

# 检查环境变量
cat .env

# 测试 API
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/test.jpg","style":"ghibli"}'
```

## 📝 常见问题

### Q: 为什么推荐 Coze API？
A: 效果最好，最接近沙箱版本的 `coze-coding-dev-sdk`。

### Q: 如何获取 Coze API Token？
A: 需要在 Coze 平台创建智能体并部署为 API 服务。

### Q: 可以不用 AI 吗？
A: 可以，前端已支持"不使用 AI"模式，直接像素化。

### Q: 如何更换 AI 方案？
A: 修改 `.env` 中的 `AI_PROVIDER` 值即可。

## 📚 相关文档

- [部署指南](./DEPLOYMENT.md)
- [API 文档](./API.md)
- [Coze 平台文档](https://www.coze.com/docs)
- [Stability AI 文档](https://stability.ai/docs)
- [腾讯云混元文档](https://cloud.tencent.com/document/product/1729)

## 🤝 技术支持

遇到问题？

1. 查看日志
2. 检查环境变量
3. 测试 API 连接
4. 查看 DEPLOYMENT.md

## 📄 许可证

MIT License
