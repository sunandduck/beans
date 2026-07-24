import axios from 'axios';
import { stylePrompts } from '../api/generate';

/**
 * Coze 官方 API 客户端
 * 
 * 使用方式：
 * 1. 在 Coze 平台创建智能体
 * 2. 部署智能体为 API 服务
 * 3. 获取 API Token 和 Agent ID
 * 4. 配置环境变量
 */
export class CozeApiClient {
  private apiToken: string;
  private agentId: string;
  private apiBase: string;

  constructor() {
    this.apiToken = process.env.COZE_API_TOKEN || '';
    this.agentId = process.env.COZE_AGENT_ID || '';
    this.apiBase = process.env.COZE_API_BASE || 'https://api.coze.cn';

    if (!this.apiToken || !this.agentId) {
      throw new Error('Coze API 配置缺失，请检查 COZE_API_TOKEN 和 COZE_AGENT_ID');
    }
  }

  /**
   * 生成卡通化图片
   */
  async generateImage(imageUrl: string, style: string = 'ghibli'): Promise<{ imageUrl: string }> {
    try {
      console.log('[Coze API] 开始调用');

      // 构造提示词
      const stylePrompt = stylePrompts[style] || stylePrompts.ghibli;
      const prompt = `请将这张图片转换为${stylePrompt}。保持主体特征，简化背景，输出清晰的卡通图像。`;

      // 调用 Coze API
      const response = await axios.post(
        `${this.apiBase}/v3/chat`,
        {
          agent_id: this.agentId,
          user_id: 'perler-bead-user',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000 // 120秒超时
        }
      );

      console.log('[Coze API] 响应:', response.status);

      // 解析响应
      const data = response.data;
      
      if (data.code !== 0) {
        throw new Error(`Coze API 错误: ${data.msg}`);
      }

      // 提取生成的图片 URL
      // 注意：具体字段路径需要根据实际 API 响应调整
      const generatedImageUrl = this.extractImageUrl(data);
      
      if (!generatedImageUrl) {
        throw new Error('未能从响应中提取图片 URL');
      }

      return { imageUrl: generatedImageUrl };

    } catch (error: any) {
      console.error('[Coze API] 错误:', error.message);
      
      if (error.response) {
        console.error('[Coze API] 响应状态:', error.response.status);
        console.error('[Coze API] 响应数据:', error.response.data);
      }
      
      throw new Error(`Coze API 调用失败: ${error.message}`);
    }
  }

  /**
   * 从响应中提取图片 URL
   */
  private extractImageUrl(data: any): string | null {
    try {
      // 尝试多种可能的响应格式
      // 格式1: data.data.messages[0].content
      if (data.data?.messages?.[0]?.content) {
        const content = data.data.messages[0].content;
        if (typeof content === 'string') {
          // 尝试从文本中提取 URL
          const urlMatch = content.match(/https?:\/\/[^\s]+/);
          if (urlMatch) return urlMatch[0];
        }
        if (Array.isArray(content)) {
          const imageItem = content.find((item: any) => item.type === 'image_url');
          if (imageItem?.image_url?.url) {
            return imageItem.image_url.url;
          }
        }
      }

      // 格式2: data.data.answer
      if (data.data?.answer) {
        const urlMatch = data.data.answer.match(/https?:\/\/[^\s]+/);
        if (urlMatch) return urlMatch[0];
      }

      // 格式3: data.messages[0].content
      if (data.messages?.[0]?.content) {
        const content = data.messages[0].content;
        if (typeof content === 'string') {
          const urlMatch = content.match(/https?:\/\/[^\s]+/);
          if (urlMatch) return urlMatch[0];
        }
      }

      return null;
    } catch (error) {
      console.error('[Coze API] 解析响应失败:', error);
      return null;
    }
  }
}
