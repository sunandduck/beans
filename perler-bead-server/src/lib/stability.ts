import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Stability AI 客户端
 * 
 * 使用方式：
 * 1. 注册 https://stability.ai
 * 2. 获取 API Key
 * 3. 配置环境变量 STABILITY_API_KEY
 */
export class StabilityClient {
  private apiKey: string;
  private apiBase: string;

  constructor() {
    this.apiKey = process.env.STABILITY_API_KEY || '';
    this.apiBase = 'https://api.stability.ai';

    if (!this.apiKey) {
      throw new Error('Stability API Key 未配置');
    }
  }

  /**
   * 生成卡通化图片
   */
  async generateImage(imageUrl: string, style: string = 'ghibli'): Promise<{ imageUrl: string }> {
    try {
      console.log('[Stability AI] 开始调用');

      // 下载原图
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data);

      // 调用 Stability AI Image-to-Image API
      const response = await axios.post(
        `${this.apiBase}/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image`,
        {
          init_image: imageBuffer.toString('base64'),
          image_strength: 0.35,
          steps: 30,
          cfg_scale: 7,
          style_preset: this.getStylePreset(style),
          text_prompts: [
            {
              text: this.getStylePrompt(style),
              weight: 1
            },
            {
              text: 'blurry, low quality, distorted, ugly, bad anatomy',
              weight: -1
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 120000
        }
      );

      console.log('[Stability AI] 响应:', response.status);

      // 保存生成的图片
      const resultData = response.data;
      if (!resultData.artifacts || resultData.artifacts.length === 0) {
        throw new Error('未生成图片');
      }

      // 取第一张图片
      const imageBase64 = resultData.artifacts[0].base64;
      const imageBuffer2 = Buffer.from(imageBase64, 'base64');
      
      // 保存到临时文件
      const tempDir = path.join(__dirname, '../../uploads');
      const tempFile = path.join(tempDir, `stability-${Date.now()}.png`);
      fs.writeFileSync(tempFile, imageBuffer2);

      // TODO: 上传到 COS 并返回 URL
      // 暂时返回本地路径
      const localUrl = `/public/uploads/${path.basename(tempFile)}`;

      return { imageUrl: localUrl };

    } catch (error: any) {
      console.error('[Stability AI] 错误:', error.message);
      
      if (error.response) {
        console.error('[Stability AI] 响应状态:', error.response.status);
        console.error('[Stability AI] 响应数据:', error.response.data);
      }
      
      throw new Error(`Stability AI 调用失败: ${error.message}`);
    }
  }

  /**
   * 获取风格预设
   */
  private getStylePreset(style: string): string {
    const presets: Record<string, string> = {
      ghibli: 'anime',
      chibi_cartoon: 'anime',
      anime_pixel: 'pixel-art',
      retro_game: 'pixel-art',
      chibi: 'anime'
    };
    return presets[style] || 'anime';
  }

  /**
   * 获取风格提示词
   */
  private getStylePrompt(style: string): string {
    const prompts: Record<string, string> = {
      ghibli: 'Studio Ghibli style, Miyazaki style, soft colors, warm lighting, detailed illustration',
      chibi_cartoon: 'chibi style, cute, big head small body, colorful, cartoon',
      anime_pixel: 'anime pixel art, retro game style, 8-bit, pixelated',
      retro_game: 'retro game pixel art, classic game style, 8-bit graphics',
      chibi: 'chibi style, cartoon, simplified details, cute'
    };
    return prompts[style] || prompts.ghibli;
  }
}
