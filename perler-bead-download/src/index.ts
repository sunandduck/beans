import express, { type Express } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 导入 API 路由
import { generateRouter } from './api/generate';
import { removeBgRouter } from './api/remove-bg';
import { uploadRouter } from './api/upload';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件
app.use('/public', express.static(path.join(__dirname, '../public')));

// 上传临时目录
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    provider: process.env.AI_PROVIDER || 'not configured'
  });
});

// API 路由
app.use('/api/generate', generateRouter);
app.use('/api/remove-bg', removeBgRouter);
app.use('/api/upload', uploadRouter);

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || '服务器内部错误'
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在'
  });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`🚀 拼豆图纸生成器服务已启动`);
  console.log(`📍 地址: http://localhost:${PORT}`);
  console.log(`🔧 AI 方案: ${process.env.AI_PROVIDER || '未配置'}`);
  console.log(`💊 健康检查: http://localhost:${PORT}/api/health`);
});

export default app;
