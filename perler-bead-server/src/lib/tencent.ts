import axios from 'axios';
import * as crypto from 'crypto';

/**
 * 腾讯云混元生图客户端
 * 
 * 使用方式：
 * 1. 获取腾讯云密钥
 * 2. 开通混元生图服务
 * 3. 配置环境变量
 */
export class TencentClient {
  private secretId: string;
  private secretKey: string;
  private region: string;

  constructor() {
    this.secretId = process.env.TENCENTCLOUD_SECRET_ID || '';
    this.secretKey = process.env.TENCENTCLOUD_SECRET_KEY || '';
    this.region = process.env.COS_REGION || 'ap-guangzhou';

    if (!this.secretId || !this.secretKey) {
      throw new Error('腾讯云密钥未配置');
    }
  }

  /**
   * 生成卡通化图片
   */
  async generateImage(imageUrl: string, style: string = 'ghibli'): Promise<{ imageUrl: string }> {
    try {
      console.log('[腾讯云] 开始调用');

      // 风格映射
      const styleMap: Record<string, number> = {
        ghibli: 123,
        chibi_cartoon: 107,
        anime_pixel: 201,
        retro_game: 129,
        chibi: 116
      };

      const styleId = styleMap[style] || 123;

      // 构造请求
      const params = {
        Action: 'ImageToImage',
        Version: '2022-12-01',
        Timestamp: Math.floor(Date.now() / 1000),
        Nonce: Math.floor(Math.random() * 1000000),
        SecretId: this.secretId,
        Region: this.region,
        ImageUrl: imageUrl,
        StyleId: styleId,
        OutputUrl: true
      };

      // 生成签名
      const signature = this.generateSignature(params);

      // 调用 API
      const response = await axios.post(
        'https://hunyuan.tencentcloudapi.com',
        params,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `TC3-HMAC-SHA256 Credential=${this.secretId}/${this.getDate()}/hunyuan/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`
          },
          timeout: 120000
        }
      );

      console.log('[腾讯云] 响应:', response.status);

      const data = response.data;
      
      if (data.Response?.Error) {
        throw new Error(`腾讯云 API 错误: ${data.Response.Error.Message}`);
      }

      const resultImageUrl = data.Response?.ResultImage;
      
      if (!resultImageUrl) {
        throw new Error('未能从响应中提取图片 URL');
      }

      return { imageUrl: resultImageUrl };

    } catch (error: any) {
      console.error('[腾讯云] 错误:', error.message);
      
      if (error.response) {
        console.error('[腾讯云] 响应状态:', error.response.status);
        console.error('[腾讯云] 响应数据:', JSON.stringify(error.response.data));
      }
      
      throw new Error(`腾讯云 API 调用失败: ${error.message}`);
    }
  }

  /**
   * 生成签名
   */
  private generateSignature(params: any): string {
    // 简化的签名生成
    // 实际需要根据腾讯云文档实现完整的签名算法
    const stringToSign = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    const hash = crypto.createHmac('sha256', this.secretKey)
      .update(stringToSign)
      .digest('hex');
    
    return hash;
  }

  /**
   * 获取日期
   */
  private getDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
