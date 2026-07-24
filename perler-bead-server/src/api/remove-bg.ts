import { Router, type IRouter } from 'express';
import axios from 'axios';
import { uploadToCOS, deleteFromCOS } from '../lib/cos';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export const removeBgRouter: IRouter = Router();

/**
 * POST /api/remove-bg
 * 去除图片背景
 */
removeBgRouter.post('/', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: '缺少图片URL'
      });
    }

    console.log('[抠图] 开始处理');

    // 下载原图
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);
    
    // 生成临时文件名
    const tempFileName = `temp-${uuidv4()}${path.extname(imageUrl) || '.png'}`;
    const tempFilePath = path.join(__dirname, '../../uploads', tempFileName);
    
    // 保存临时文件
    fs.writeFileSync(tempFilePath, imageBuffer);

    // 上传到 COS
    const cosKey = await uploadToCOS(tempFilePath, tempFileName);
    
    // 调用腾讯云 CI 抠图 API
    const resultUrl = await callTencentRemoveBg(cosKey);
    
    // 清理临时文件
    fs.unlinkSync(tempFilePath);
    await deleteFromCOS(cosKey);

    console.log('[抠图] 处理完成');

    res.json({
      success: true,
      imageUrl: resultUrl
    });

  } catch (error: any) {
    console.error('[抠图] 错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || '抠图失败'
    });
  }
});

/**
 * 调用腾讯云 CI 抠图 API
 */
async function callTencentRemoveBg(cosKey: string): Promise<string> {
  const { TENCENTCLOUD_SECRET_ID, TENCENTCLOUD_SECRET_KEY, COS_BUCKET, COS_REGION } = process.env;

  if (!TENCENTCLOUD_SECRET_ID || !TENCENTCLOUD_SECRET_KEY) {
    throw new Error('腾讯云密钥未配置');
  }

  // 构造 CI API 请求
  const bucket = COS_BUCKET || 'coze-1452232211';
  const region = COS_REGION || 'ap-guangzhou';
  
  // 这里需要调用腾讯云数据万象的抠图 API
  // 具体实现需要根据腾讯云文档调整
  const apiUrl = `https://${bucket}.pic.${region}.myqcloud.com/${cosKey}?imageMogr2/auto-orient`;
  
  // TODO: 实现完整的腾讯云 CI 抠图调用
  // 参考：https://cloud.tencent.com/document/product/460/83695
  
  // 临时返回原图 URL
  return apiUrl;
}
