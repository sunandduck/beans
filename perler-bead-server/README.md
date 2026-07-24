# 拼豆图纸生成器 - 独立部署版本

## 部署说明

### 方案选择

#### 方案A：Coze 官方 API（推荐）
- 效果最好，接近沙箱版本
- 需要创建智能体并部署
- 费用：约 0.1-0.2元/次调用

#### 方案B：Stability AI
- 效果较好
- 需要 API Key
- 费用：约 0.3-0.5元/次调用

#### 方案C：腾讯云混元
- 效果一般
- 已有密钥可直接使用
- 费用：约 0.1元/次调用

---

## 快速开始

### 1. 安装依赖
```bash
cd perler-bead-server
pnpm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 API 密钥
```

### 3. 启动服务
```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

### 4. 访问
- 前端：http://localhost:3000
- API：http://localhost:3000/api

---

## 方案A：Coze 官方 API

### 前置步骤

1. **创建智能体**
   - 登录 https://www.coze.com
   - 创建新智能体
   - 添加"图像生成"插件
   - 配置提示词（参考下方）

2. **部署智能体**
   - 点击"部署"
   - 选择"API 服务"
   - 获取 API Token

3. **配置环境变量**
```env
COZE_API_TOKEN=your_api_token_here
COZE_AGENT_ID=your_agent_id_here
```

### 智能体提示词模板

```
你是一个专业的图像卡通化助手。用户会上传一张照片，你需要：

1. 识别照片中的主体（人物、动物或物品）
2. 将主体转换为卡通风格
3. 保持主体特征，简化背景
4. 输出清晰的卡通图像

风格要求：
- 扁平化设计
- 色彩鲜明
- 线条简洁
- 适合像素化处理
```

---

## 方案B：Stability AI

### 获取 API Key

1. 注册 https://stability.ai
2. 获取 API Key
3. 配置环境变量

```env
STABILITY_API_KEY=your_key_here
```

---

## 方案C：腾讯云混元

### 前置步骤

1. 已有腾讯云密钥
2. 开通混元生图服务
3. 配置环境变量

```env
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
COS_BUCKET=coze-1452232211
COS_REGION=ap-guangzhou
```

---

## API 接口

### POST /api/generate

**请求**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "useAi": true,
  "style": "ghibli"
}
```

**响应**
```json
{
  "success": true,
  "imageUrl": "https://example.com/generated.jpg"
}
```

### POST /api/remove-bg

**请求**
```json
{
  "imageUrl": "https://example.com/image.jpg"
}
```

**响应**
```json
{
  "success": true,
  "imageUrl": "https://example.com/no-bg.png"
}
```

---

## 部署到服务器

### 使用 PM2

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start npm --name "perler-bead" -- start

# 查看状态
pm2 status

# 查看日志
pm2 logs perler-bead
```

### 使用 Docker

```bash
# 构建镜像
docker build -t perler-bead-server .

# 运行容器
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name perler-bead \
  perler-bead-server
```

### Nginx 配置

```nginx
server {
    listen 80;
    server_name yourbeans.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 费用对比

| 方案 | 单次调用 | 月费用（1000次） | 效果 |
|------|----------|------------------|------|
| Coze API | 0.1-0.2元 | 100-200元 | ⭐⭐⭐⭐⭐ |
| Stability AI | 0.3-0.5元 | 300-500元 | ⭐⭐⭐⭐ |
| 腾讯云混元 | 0.1元 | 100元 | ⭐⭐ |

---

## 故障排查

### API 调用失败
- 检查 API Key 是否正确
- 检查网络连接
- 查看日志：`pm2 logs` 或 `docker logs`

### 图片上传失败
- 检查 COS 配置
- 检查存储空间
- 查看权限设置

### 生成效果差
- 调整提示词
- 更换 API 方案
- 优化图片预处理

---

## 技术支持

如有问题，请查看：
- 日志文件：`logs/app.log`
- 错误日志：`logs/error.log`
- API 文档：`http://localhost:3000/api-docs`
