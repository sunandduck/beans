import { Router, type IRouter } from 'express';
import multer from 'multer';
import path from 'path';
import { uploadToCOS } from '../lib/cos';

export const uploadRouter: IRouter = Router();

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
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

/**
 * POST /api/upload
 * 上传图片到 COS
 */
uploadRouter.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '未选择文件'
      });
    }

    console.log('[上传] 开始上传文件:', req.file.originalname);

    // 上传到 COS
    const cosUrl = await uploadToCOS(req.file.path, req.file.filename);

    console.log('[上传] 上传完成:', cosUrl);

    res.json({
      success: true,
      url: cosUrl,
      filename: req.file.filename
    });

  } catch (error: any) {
    console.error('[上传] 错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || '上传失败'
    });
  }
});
