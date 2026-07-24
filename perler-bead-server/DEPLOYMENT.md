# 拼豆图纸生成器 - 部署指南

## 快速部署（推荐）

### 方式一：Docker Compose（最简单）

```bash
# 1. 克隆或上传代码到服务器
cd perler-bead-server

# 2. 配置环境变量
cp .env.example .env
nano .env  # 编辑填入你的 API 密钥

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f perler-bead-server
```

### 方式二：直接部署

```bash
# 1. 安装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 安装 pnpm
npm install -g pnpm

# 3. 安装依赖
cd perler-bead-server
pnpm install

# 4. 配置环境变量
cp .env.example .env
nano .env

# 5. 构建
pnpm build

# 6. 使用 PM2 启动
npm install -g pm2
pm2 start npm --name "perler-bead" -- start
pm2 save
pm2 startup
```

---

## 详细部署步骤

### 1. 服务器准备

**系统要求**
- Ubuntu 20.04+ / CentOS 7+
- 2核 CPU
- 4GB 内存
- 20GB 硬盘
- 开放端口：80, 443

**安装 Docker（方式一）**
```bash
# 安装 Docker
curl -fsSL https://get.docker.com | bash

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证
docker --version
docker-compose --version
```

### 2. 配置环境变量

```bash
# 复制模板
cp .env.example .env

# 编辑配置
nano .env
```

**必填配置**
```env
# 选择 AI 方案（推荐 coze）
AI_PROVIDER=coze

# Coze API 配置
COZE_API_TOKEN=your_token_here
COZE_AGENT_ID=your_agent_id_here

# 腾讯云配置（用于对象存储和抠图）
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
COS_BUCKET=your-bucket-name
COS_REGION=ap-guangzhou
```

### 3. 域名配置

**购买域名**
- 阿里云：https://wanwang.aliyun.com
- 腾讯云：https://cloud.tencent.com/product/domain
- GoDaddy：https://www.godaddy.com

**DNS 解析**
```
类型    主机记录    记录值
A       @          你的服务器IP
A       www        你的服务器IP
```

**SSL 证书**
```bash
# 使用 Let's Encrypt 免费证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourbeans.com -d www.yourbeans.com
```

### 4. Nginx 配置

```bash
# 复制配置文件
cp nginx.conf /etc/nginx/nginx.conf

# 修改域名
nano /etc/nginx/nginx.conf
# 将 yourbeans.com 替换为你的域名

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 5. 启动服务

**Docker 方式**
```bash
# 启动
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

**PM2 方式**
```bash
# 启动
pm2 start npm --name "perler-bead" -- start

# 设置开机自启
pm2 save
pm2 startup

# 查看状态
pm2 status

# 查看日志
pm2 logs perler-bead
```

### 6. 验证部署

```bash
# 健康检查
curl http://localhost:3000/api/health

# 应该返回
{"status":"ok","timestamp":"...","provider":"coze"}
```

访问你的域名：https://yourbeans.com

---

## 维护指南

### 日志查看

```bash
# Docker 方式
docker-compose logs -f perler-bead-server

# PM2 方式
pm2 logs perler-bead

# Nginx 日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 重启服务

```bash
# Docker 方式
docker-compose restart

# PM2 方式
pm2 restart perler-bead
```

### 更新代码

```bash
# 拉取最新代码
git pull

# 重新构建
pnpm install
pnpm build

# 重启服务
pm2 restart perler-bead
# 或
docker-compose restart
```

### 备份数据

```bash
# 备份上传文件
tar -czf uploads-backup-$(date +%Y%m%d).tar.gz uploads/

# 备份数据库（如果有）
# mysqldump -u root -p database_name > backup.sql
```

---

## 故障排查

### 服务无法启动

```bash
# 检查端口占用
netstat -tlnp | grep 3000

# 检查日志
docker-compose logs perler-bead-server
# 或
pm2 logs perler-bead --lines 100
```

### API 调用失败

1. 检查环境变量
```bash
cat .env
```

2. 测试 API 连接
```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/test.jpg","style":"ghibli"}'
```

### 内存不足

```bash
# 查看内存使用
free -h

# 增加 swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 磁盘空间不足

```bash
# 查看磁盘使用
df -h

# 清理日志
sudo journalctl --vacuum-time=7d

# 清理 Docker
docker system prune -a
```

---

## 性能优化

### Nginx 优化

```nginx
# 开启 gzip
gzip on;
gzip_types text/plain application/json application/javascript text/css;

# 缓存静态文件
location /public/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### Node.js 优化

```bash
# 增加内存限制
NODE_OPTIONS="--max-old-space-size=2048" pm2 start npm --name "perler-bead" -- start
```

### 数据库优化（如果有）

- 使用连接池
- 添加索引
- 定期清理历史数据

---

## 安全加固

### 防火墙配置

```bash
# Ubuntu
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 限制 API 访问频率

```nginx
# Nginx 限流配置
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://perler-bead;
}
```

### 定期更新

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 更新 Node.js
# 更新依赖
pnpm update

# 重启服务
pm2 restart perler-bead
```

---

## 监控告警

### 使用 PM2 监控

```bash
# 安装 PM2 Plus
pm2 plus

# 或使用 PM2 Keymetrics
pm2 link <secret> <public>
```

### 使用 UptimeRobot

1. 注册 https://uptimerobot.com
2. 添加监控
   - URL: `https://yourbeans.com/api/health`
   - 间隔: 5 分钟
3. 配置告警（邮件/短信）

### 日志分析

```bash
# 查看错误日志
grep -i error /var/log/nginx/error.log | tail -20

# 统计访问
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn
```

---

## 成本估算

### 服务器费用

| 配置 | 月费用 | 年费用 |
|------|--------|--------|
| 2核4G（腾讯云轻量） | ~100元 | ~1200元 |
| 2核4G（阿里云 ECS） | ~120元 | ~1440元 |
| 域名 | - | ~60元 |
| SSL 证书 | 免费 | 免费 |
| **总计** | **~100元** | **~1260元** |

### API 调用费用

| 方案 | 单次费用 | 1000次/月 |
|------|----------|-----------|
| Coze API | 0.1-0.2元 | 100-200元 |
| Stability AI | 0.3-0.5元 | 300-500元 |
| 腾讯云混元 | 0.1元 | 100元 |

### 总费用

- **低流量**（100次/月）：约 1300元/年
- **中流量**（1000次/月）：约 1500元/年
- **高流量**（10000次/月）：约 3000元/年

---

## 技术支持

遇到问题？

1. 查看日志
2. 检查环境变量
3. 测试 API 连接
4. 查看 GitHub Issues
5. 联系技术支持

---

## 附录

### 常用命令

```bash
# 查看服务状态
pm2 status
docker-compose ps

# 查看日志
pm2 logs
docker-compose logs -f

# 重启服务
pm2 restart perler-bead
docker-compose restart

# 停止服务
pm2 stop perler-bead
docker-compose down

# 删除服务
pm2 delete perler-bead
docker-compose down -v
```

### 文件结构

```
perler-bead-server/
├── src/              # 源代码
├── dist/             # 构建产物
├── uploads/          # 上传文件
├── logs/             # 日志文件
├── .env              # 环境变量
├── package.json      # 依赖配置
├── docker-compose.yml
├── Dockerfile
└── nginx.conf
```
