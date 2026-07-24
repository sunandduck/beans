import { Router, type IRouter } from 'express';
import axios from 'axios';
import { CozeApiClient } from '../lib/coze-api';
import { StabilityClient } from '../lib/stability';
import { TencentClient } from '../lib/tencent';

export const generateRouter: IRouter = Router();

// 初始化 AI 客户端
const provider = process.env.AI_PROVIDER || 'coze';

let aiClient: CozeApiClient | StabilityClient | TencentClient;

switch (provider) {
  case 'coze':
    aiClient = new CozeApiClient();
    break;
  case 'stability':
    aiClient = new StabilityClient();
    break;
  case 'tencent':
    aiClient = new TencentClient();
    break;
  default:
    throw new Error(`不支持的 AI 方案: ${provider}`);
}

/**
 * POST /api/generate
 * AI 图像卡通化
 */
generateRouter.post('/', async (req, res) => {
  try {
    const { imageUrl, style = 'ghibli' } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: '缺少图片URL'
      });
    }

    console.log(`[生成] 开始处理图片，方案: ${provider}, 风格: ${style}`);

    // 调用 AI 生成
    const result = await aiClient.generateImage(imageUrl, style);

    console.log(`[生成] 处理完成`);

    res.json({
      success: true,
      imageUrl: result.imageUrl,
      provider: provider
    });

  } catch (error: any) {
    console.error('[生成] 错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || '图像生成失败'
    });
  }
});

/**
 * 风格映射
 */
export const stylePrompts: Record<string, string> = {
  ghibli: '吉卜力动画风格，宫崎骏风格，柔和色彩，温暖光线，细腻笔触',
  chibi_cartoon: 'Q版卡通风格，大头小身，可爱圆润，色彩鲜艳',
  anime_pixel: '动漫像素风格，复古游戏感，方块像素，8-bit风格',
  retro_game: '复古游戏风格，像素艺术，经典游戏画面',
  chibi: 'Q版风格，卡通化，简化细节，突出特征'
};
